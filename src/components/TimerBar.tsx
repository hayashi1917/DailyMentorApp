"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTodayDate } from "@/lib/date";
import type { TimeEntry } from "@/lib/types";

const QUICK_LABELS = ["ご飯", "移動", "休憩"];

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * リアルタイム計測バー: 実行中エントリの表示・停止と、
 * 生活ブロック(ご飯・移動・休憩)のクイック開始。
 * タスクの開始はタスク一覧の▶ボタンから行う。
 */
export default function TimerBar() {
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRunning((data as TimeEntry | null) ?? null);
  }, []);

  useEffect(() => {
    load();
    // 経過分の表示を1分ごとに更新
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    const onChanged = () => load();
    window.addEventListener("time-entry-changed", onChanged);
    return () => {
      clearInterval(t);
      window.removeEventListener("time-entry-changed", onChanged);
    };
  }, [load]);

  async function stop() {
    if (!running) return;
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("time_entries")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", running.id);
    setRunning(null);
    setBusy(false);
    window.dispatchEvent(new Event("time-entry-changed"));
  }

  async function quickStart(label: string) {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 実行中があれば止めてから開始する(同時計測は1件まで)
    if (running) {
      await supabase
        .from("time_entries")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", running.id);
    }
    const { data } = await supabase
      .from("time_entries")
      .insert({
        user_id: user.id,
        task_id: null,
        label,
        date: getTodayDate(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    setRunning((data as TimeEntry | null) ?? null);
    setBusy(false);
    window.dispatchEvent(new Event("time-entry-changed"));
  }

  if (running) {
    const elapsed = Math.max(
      0,
      Math.round((Date.now() - new Date(running.started_at).getTime()) / 60_000)
    );
    return (
      <div className="flex items-center justify-between rounded-2xl border border-brand-500 bg-brand-50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800">
            ⏱ {running.label}
          </p>
          <p className="text-xs text-brand-700">
            {fmtTime(running.started_at)}〜 実行中(経過{elapsed}分)
          </p>
        </div>
        <button
          onClick={stop}
          disabled={busy}
          className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          停止
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
      <span className="text-xs text-gray-400">⏱ 計測:</span>
      {QUICK_LABELS.map((l) => (
        <button
          key={l}
          onClick={() => quickStart(l)}
          disabled={busy}
          className="rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-600 active:bg-gray-50 disabled:opacity-50"
        >
          {l}
        </button>
      ))}
      <span className="ml-auto text-[10px] text-gray-300">タスクは一覧の▶から</span>
    </div>
  );
}
