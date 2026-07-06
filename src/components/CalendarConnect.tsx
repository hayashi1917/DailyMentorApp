"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CalendarConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("google_calendar_connections")
      .select("id, google_email")
      .maybeSingle();
    setConnected(!!data);
    setEmail(data?.google_email ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect() {
    if (!confirm("Googleカレンダー連携を解除しますか？")) return;
    setBusy(true);
    try {
      await fetch("/api/google/disconnect", { method: "POST" });
      setConnected(false);
      setEmail(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-gray-400">確認中...</p>;
  }

  return connected ? (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm text-gray-800">✅ 連携済み</p>
        {email && <p className="truncate text-xs text-gray-400">{email}</p>}
      </div>
      <button
        onClick={disconnect}
        disabled={busy}
        className="shrink-0 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
      >
        解除する
      </button>
    </div>
  ) : (
    <div>
      <p className="text-xs leading-relaxed text-gray-500">
        連携すると、今日の予定から空き時間を検出し、計画に反映できます。
        作業ブロックをカレンダーに登録することもできます。
      </p>
      <a
        href="/api/google/auth"
        className="mt-3 block w-full rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white active:bg-brand-700"
      >
        Googleカレンダーを連携する
      </a>
    </div>
  );
}
