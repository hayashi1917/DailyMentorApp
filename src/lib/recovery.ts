import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/date";
import type { DailyReview } from "@/lib/types";

export type RecoveryJudgement = {
  isRecoveryMode: boolean;
  reasons: string[];
};

/**
 * Recovery Mode is triggered when any of:
 * - the last 2 days both have minimum_completed = 'not_completed'
 * - the last 2 days both have no review at all
 * - there are 10+ incomplete tasks
 */
export async function judgeRecoveryMode(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<RecoveryJudgement> {
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const reasons: string[] = [];

  const [{ data: reviews }, { count: todoCount }] = await Promise.all([
    supabase
      .from("daily_reviews")
      .select("date, minimum_completed")
      .eq("user_id", userId)
      .in("date", [yesterday, dayBefore]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "todo"),
  ]);

  const byDate = new Map<string, Pick<DailyReview, "minimum_completed">>();
  (reviews ?? []).forEach((r) => byDate.set(r.date, r));

  const r1 = byDate.get(yesterday);
  const r2 = byDate.get(dayBefore);

  if (
    r1?.minimum_completed === "not_completed" &&
    r2?.minimum_completed === "not_completed"
  ) {
    reasons.push("2日連続で最低ラインが未達でした");
  }

  if (!r1 && !r2) {
    reasons.push("2日連続でレビューが未入力でした");
  }

  if ((todoCount ?? 0) >= 10) {
    reasons.push(`未完了タスクが${todoCount}件たまっています`);
  }

  return { isRecoveryMode: reasons.length > 0, reasons };
}
