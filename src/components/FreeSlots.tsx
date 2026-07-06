"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanItem } from "@/lib/types";

type Slot = { start: string; end: string; minutes: number };
type SlotsResponse = {
  connected: boolean;
  configured: boolean;
  slots?: Slot[];
  events?: { summary: string; start: string; end: string; allDay: boolean }[];
  error?: string;
};

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Shows today's free slots (from Google Calendar) and lets the user
 * register a plan item as a work block into a chosen slot.
 */
export default function FreeSlots({ planItems }: { planItems: PlanItem[] }) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/free-slots");
      const json = (await res.json()) as SlotsResponse;
      setData(res.ok ? json : { connected: false, configured: true, error: json.error });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function registerBlock(item: PlanItem, slot: Slot) {
    setBusy(true);
    setMessage(null);
    try {
      const minutes = Math.min(item.estimated_minutes ?? 30, slot.minutes);
      const end = new Date(
        new Date(slot.start).getTime() + minutes * 60_000
      ).toISOString();
      const res = await fetch("/api/calendar/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          start: slot.start,
          end,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "登録に失敗しました");
        return;
      }
      setMessage(`「${item.title}」を ${fmtTime(slot.start)} からのブロックとして登録しました`);
      setSelectedSlot(null);
      load();
    } catch {
      setMessage("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 未連携・未設定時は何も表示しない(設定画面から連携できる)
  if (loading || !data || !data.connected) return null;

  const slots = data.slots ?? [];

  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700">📅 今日の空き時間</h2>
        <button onClick={load} className="text-xs text-gray-400">
          更新
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          この後の空き時間はほとんどありません。無理のない範囲でいきましょう。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {slots.map((s) => (
            <li key={s.start}>
              <button
                onClick={() =>
                  setSelectedSlot(
                    selectedSlot?.start === s.start ? null : s
                  )
                }
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                  selectedSlot?.start === s.start
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200"
                }`}
              >
                <span className="font-medium text-gray-800">
                  {fmtTime(s.start)}〜{fmtTime(s.end)}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  ({s.minutes}分)
                </span>
              </button>

              {selectedSlot?.start === s.start && planItems.length > 0 && (
                <div className="mt-1.5 rounded-xl bg-gray-50 p-2">
                  <p className="px-1 text-[10px] text-gray-500">
                    この時間にカレンダー登録する計画:
                  </p>
                  <div className="mt-1 space-y-1">
                    {planItems.slice(0, 6).map((item, i) => (
                      <button
                        key={i}
                        onClick={() => registerBlock(item, s)}
                        disabled={busy}
                        className="block w-full rounded-lg bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-sm active:bg-gray-100 disabled:opacity-50"
                      >
                        {item.title}
                        {item.estimated_minutes != null &&
                          ` (${item.estimated_minutes}分)`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <p className="mt-2 text-xs text-brand-600">{message}</p>}
    </section>
  );
}
