import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addDays, getTodayDate } from "@/lib/date";
import type { DailyPlanRow, DailyReview } from "@/lib/types";

const LOOKBACK_DAYS = 30;

/**
 * Recompute lifestyle_patterns from reviews / plans / tasks.
 *
 * NOTE(MVP): 時間帯別の成功率は、正確なタスク実行時刻が取れないため
 * completed_at の時刻を簡易的に使う。将来 Google Calendar 連携後に精緻化する。
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = getTodayDate();
  const since = addDays(today, -LOOKBACK_DAYS);

  const [reviewsRes, plansRes, tasksRes] = await Promise.all([
    supabase
      .from("daily_reviews")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", since),
    supabase
      .from("daily_plans")
      .select("id, date, is_recovery_mode")
      .eq("user_id", user.id)
      .gte("date", since),
    supabase
      .from("tasks")
      .select("id, status, completed_at, difficulty")
      .eq("user_id", user.id)
      .eq("status", "done")
      .gte("completed_at", `${since}T00:00:00+09:00`),
  ]);

  const reviews = (reviewsRes.data ?? []) as DailyReview[];
  const plans = (plansRes.data ?? []) as Pick<
    DailyPlanRow,
    "id" | "date" | "is_recovery_mode"
  >[];
  const doneTasks = tasksRes.data ?? [];

  const patterns: { pattern_key: string; value: number; sample_size: number }[] =
    [];

  // --- 最低ライン達成率 ---
  const scored = reviews.filter((r) => r.minimum_completed != null);
  if (scored.length > 0) {
    const completed = scored.filter(
      (r) => r.minimum_completed === "completed"
    ).length;
    patterns.push({
      pattern_key: "minimum_plan_completion_rate",
      value: completed / scored.length,
      sample_size: scored.length,
    });
  }

  // --- Recovery Mode 成功率 ---
  const recoveryDates = new Set(
    plans.filter((p) => p.is_recovery_mode).map((p) => p.date)
  );
  const recoveryReviews = scored.filter((r) => recoveryDates.has(r.date));
  if (recoveryReviews.length > 0) {
    const ok = recoveryReviews.filter(
      (r) => r.minimum_completed !== "not_completed"
    ).length;
    patterns.push({
      pattern_key: "recovery_mode_success_rate",
      value: ok / recoveryReviews.length,
      sample_size: recoveryReviews.length,
    });
  }

  // --- レビュー入力率 ---
  patterns.push({
    pattern_key: "review_rate",
    value: Math.min(1, reviews.length / LOOKBACK_DAYS),
    sample_size: LOOKBACK_DAYS,
  });

  // --- 失敗理由の頻度 ---
  const reasonCounts = new Map<string, number>();
  let totalReasons = 0;
  for (const r of reviews) {
    for (const reason of r.failure_reasons ?? []) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      totalReasons++;
    }
  }
  if (totalReasons > 0) {
    for (const [reason, count] of reasonCounts) {
      patterns.push({
        pattern_key: `failure_reason_${reason}`,
        value: count / totalReasons,
        sample_size: totalReasons,
      });
    }
  }

  // --- 時間帯別の成功率(簡易版: completed_at の時刻ベース) ---
  // 将来Calendar連携で「予定した時間帯 vs 実行できたか」に置き換える
  const buckets = { morning: 0, afternoon: 0, evening: 0 };
  for (const t of doneTasks) {
    if (!t.completed_at) continue;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        hour: "numeric",
        hour12: false,
      }).format(new Date(t.completed_at))
    );
    if (hour >= 5 && hour < 12) buckets.morning++;
    else if (hour >= 12 && hour < 18) buckets.afternoon++;
    else buckets.evening++;
  }
  const totalDone = buckets.morning + buckets.afternoon + buckets.evening;
  if (totalDone > 0) {
    patterns.push(
      {
        pattern_key: "morning_success_rate",
        value: buckets.morning / totalDone,
        sample_size: totalDone,
      },
      {
        pattern_key: "afternoon_success_rate",
        value: buckets.afternoon / totalDone,
        sample_size: totalDone,
      },
      {
        pattern_key: "evening_success_rate",
        value: buckets.evening / totalDone,
        sample_size: totalDone,
      }
    );
  }

  const rows = patterns.map((p) => ({
    user_id: user.id,
    pattern_key: p.pattern_key,
    value: p.value,
    sample_size: p.sample_size,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("lifestyle_patterns")
      .upsert(rows, { onConflict: "user_id,pattern_key" });

    if (error) {
      console.error("update-patterns failed:", error);
      return NextResponse.json(
        { error: "パターンの更新に失敗しました" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ updated: rows.length, patterns: rows });
}
