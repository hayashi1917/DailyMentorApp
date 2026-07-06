"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTodayDate } from "@/lib/date";
import {
  FAILURE_REASON_LABELS,
  MINIMUM_COMPLETED_LABELS,
} from "@/lib/labels";
import type { MinimumCompleted } from "@/lib/types";
import AppShell from "@/components/AppShell";

const SCORE_LABELS: Record<number, string> = {
  0: "0: 動けなかった",
  1: "1: 少し進んだ",
  2: "2: しっかり進んだ",
};

export default function ReviewPage() {
  const router = useRouter();
  const today = getTodayDate();

  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [minimumCompleted, setMinimumCompleted] =
    useState<MinimumCompleted | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [reflection, setReflection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("daily_reviews")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      if (data) {
        setExistingId(data.id);
        setMinimumCompleted(data.minimum_completed);
        setScore(data.completion_score);
        setReasons(data.failure_reasons ?? []);
        setReflection(data.reflection_text ?? "");
      }
      setLoading(false);
    })();
  }, [today]);

  function toggleReason(r: string) {
    setReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: dbError } = await supabase.from("daily_reviews").upsert(
      {
        user_id: user.id,
        date: today,
        minimum_completed: minimumCompleted,
        completion_score: score,
        failure_reasons: reasons,
        reflection_text: reflection.trim() || null,
      },
      { onConflict: "user_id,date" }
    );

    if (dbError) {
      setSaving(false);
      setError("保存に失敗しました。もう一度お試しください。");
      return;
    }

    // レビュー保存を学習に反映(失敗しても画面遷移は続行)
    try {
      await fetch("/api/learning/update-patterns", { method: "POST" });
    } catch {
      // learning update is best-effort
    }

    setSaving(false);
    setSaved(true);
  }

  if (loading) {
    return (
      <AppShell title="夜レビュー">
        <p className="mt-8 text-center text-sm text-gray-400">読み込み中...</p>
      </AppShell>
    );
  }

  if (saved) {
    return (
      <AppShell title="🌙 夜レビュー">
        <div className="mt-10 rounded-2xl bg-brand-50 px-5 py-10 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-4 font-semibold text-gray-800">
            今日もおつかれさまでした
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {minimumCompleted === "not_completed"
              ? "できなかった日も、記録した時点で一歩前進です。明日は小さく復帰しましょう。"
              : "記録が積み重なるほど、計画はあなたに合っていきます。"}
          </p>
          <button
            onClick={() => router.push("/today")}
            className="mt-6 w-full rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:bg-brand-700"
          >
            今日の画面へ戻る
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="🌙 夜レビュー">
      <p className="text-sm text-gray-500">
        {existingId
          ? "今日のレビューを編集できます"
          : "今日をふりかえりましょう。責める場ではなく、明日に活かす場です"}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-7">
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            最低ラインはできましたか？
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              Object.entries(MINIMUM_COMPLETED_LABELS) as [
                MinimumCompleted,
                string,
              ][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMinimumCompleted(key)}
                className={`rounded-xl border px-2 py-3 text-sm ${
                  minimumCompleted === key
                    ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            今日の進み具合
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                className={`rounded-xl border px-2 py-3 text-xs leading-relaxed ${
                  score === n
                    ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {SCORE_LABELS[n]}
              </button>
            ))}
          </div>
        </div>

        {(minimumCompleted === "partial" ||
          minimumCompleted === "not_completed") && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              うまくいかなかった理由(複数選択可)
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(FAILURE_REASON_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleReason(key)}
                  className={`rounded-full border px-3 py-2 text-xs ${
                    reasons.includes(key)
                      ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              理由がわかると、明日の計画がやさしくなります
            </p>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            ひとことふりかえり(任意)
          </label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            className="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
            placeholder="例: 午前中は集中できた。夜は疲れて動けなかった。"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : existingId ? "更新する" : "今日を記録する"}
        </button>
      </form>
    </AppShell>
  );
}
