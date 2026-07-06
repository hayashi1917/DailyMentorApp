"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePlanButton({
  hasPlan,
}: {
  hasPlan: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-plan/generate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "計画の生成に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={loading}
        className={`w-full rounded-2xl py-4 text-base font-semibold active:opacity-90 disabled:opacity-50 ${
          hasPlan
            ? "border border-brand-600 bg-white text-brand-600"
            : "bg-brand-600 text-white"
        }`}
      >
        {loading
          ? "メンターが計画を考えています..."
          : hasPlan
            ? "計画を作り直す"
            : "今日の計画を生成する"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
