"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTodayDate } from "@/lib/date";
import {
  FOCUS_AREA_LABELS,
  MOOD_LABELS,
  PLAN_TYPE_LABELS,
} from "@/lib/labels";
import type { Mood, PlanType } from "@/lib/types";
import AppShell from "@/components/AppShell";

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: [T, string][];
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-xl border px-2 py-3 text-sm ${
            value === key
              ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
              : "border-gray-200 bg-white text-gray-600"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function CheckinPage() {
  const router = useRouter();
  const today = getTodayDate();

  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [focusArea, setFocusArea] = useState<string | null>(null);
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("daily_checkins")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      if (data) {
        setExistingId(data.id);
        setEnergy(data.energy_level);
        setMood(data.mood);
        setFocusArea(data.focus_area);
        setPlanType(data.plan_type);
      }
      setLoading(false);
    })();
  }, [today]);

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

    const { error: dbError } = await supabase.from("daily_checkins").upsert(
      {
        user_id: user.id,
        date: today,
        energy_level: energy,
        mood,
        focus_area: focusArea,
        plan_type: planType,
      },
      { onConflict: "user_id,date" }
    );

    setSaving(false);
    if (dbError) {
      setError("保存に失敗しました。もう一度お試しください。");
      return;
    }
    router.push("/today");
    router.refresh();
  }

  if (loading) {
    return (
      <AppShell title="朝チェックイン">
        <p className="mt-8 text-center text-sm text-gray-400">読み込み中...</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="☀️ 朝チェックイン">
      <p className="text-sm text-gray-500">
        {existingId
          ? "今日のチェックインを編集できます"
          : "今日の調子を教えてください。計画づくりに使います"}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-7">
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            エネルギー
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEnergy(n)}
                className={`rounded-xl border py-3 text-base ${
                  energy === n
                    ? "border-brand-500 bg-brand-50 font-bold text-brand-700"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>くたくた</span>
            <span>元気</span>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            気分
          </label>
          <ChipGroup
            options={Object.entries(MOOD_LABELS) as [Mood, string][]}
            value={mood}
            onChange={setMood}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            今日の重点領域
          </label>
          <ChipGroup
            options={Object.entries(FOCUS_AREA_LABELS) as [string, string][]}
            value={focusArea}
            onChange={setFocusArea}
            columns={3}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            今日はどんな日にしますか？
          </label>
          <ChipGroup
            options={Object.entries(PLAN_TYPE_LABELS) as [PlanType, string][]}
            value={planType}
            onChange={setPlanType}
            columns={3}
          />
          <p className="mt-2 text-xs text-gray-400">
            しんどい日は「回復する日」で大丈夫。それも立派な選択です。
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : existingId ? "更新する" : "チェックインする"}
        </button>
      </form>
    </AppShell>
  );
}
