import type {
  DailyPlanRow,
  DailyReview,
  PlanItem,
  Task,
  TimeEntry,
} from "@/lib/types";
import { FAILURE_REASON_LABELS } from "@/lib/labels";

/** "2026-05-26" -> "5月26日" */
function dateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}

/** 90 -> "(1.5h)", 120 -> "(2h)", 30 -> "(30分)" */
function fmtEstimate(minutes?: number): string {
  if (!minutes) return "";
  if (minutes >= 60) {
    const h = minutes / 60;
    return `(${Number.isInteger(h) ? h : h.toFixed(1)}h)`;
  }
  return `(${minutes}分)`;
}

function itemText(item: PlanItem): string {
  return `${item.title}${fmtEstimate(item.estimated_minutes)}`;
}

function tierLine(rank: string, items: PlanItem[]): string {
  return `${rank}：${items.length ? items.map(itemText).join(",") : "なし"}`;
}

function fmtTimeJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * 朝の予定テキスト。
 * 最低ライン=S / 標準ライン=A / 余裕ライン=B として出力する。
 */
export function buildMorningText(plan: DailyPlanRow): string {
  const lines: string[] = [];
  lines.push(`【${dateLabel(plan.date)} 目標】`);
  lines.push("目標タスク");
  lines.push(tierLine("S", plan.minimum_plan_json ?? []));
  lines.push(tierLine("A", plan.standard_plan_json ?? []));
  lines.push(tierLine("B", plan.stretch_plan_json ?? []));
  lines.push("");
  lines.push("目標スケジュール");

  const schedule = plan.schedule_json ?? [];
  if (schedule.length) {
    for (const s of schedule) {
      lines.push(`${s.start.padStart(5, "0")} - ${s.end.padStart(5, "0")} ${s.title}`);
    }
  } else {
    lines.push("(スケジュール未生成)");
  }
  return lines.join("\n");
}

export type ReviewExportInput = {
  date: string;
  plan: DailyPlanRow | null;
  tasksById: Map<string, Task>;
  entries: TimeEntry[];
  review: {
    failure_reasons: string[];
    reflection_text: string;
  } & Partial<Pick<DailyReview, "minimum_completed" | "completion_score">>;
};

/**
 * 振り返りテキスト(リアルタイム計測ログつき)。
 */
export function buildReviewText(input: ReviewExportInput): string {
  const { date, plan, tasksById, entries, review } = input;
  const lines: string[] = [];

  lines.push(`【${dateLabel(date)} 実際】`);
  lines.push("タスク完了状況");
  lines.push(tierLine("S", plan?.minimum_plan_json ?? []));
  lines.push(tierLine("A", plan?.standard_plan_json ?? []));
  lines.push(tierLine("B", plan?.stretch_plan_json ?? []));
  lines.push("");
  lines.push("実際のスケジュール（リアルタイム計測）");

  const sorted = [...entries].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
  if (sorted.length) {
    for (const e of sorted) {
      const start = fmtTimeJst(e.started_at);
      if (e.ended_at) {
        const minutes = Math.max(
          1,
          Math.round(
            (new Date(e.ended_at).getTime() -
              new Date(e.started_at).getTime()) /
              60_000
          )
        );
        lines.push(`${start} - ${fmtTimeJst(e.ended_at)} ${e.label}（${minutes}分）`);
      } else {
        const elapsed = Math.max(
          0,
          Math.round((Date.now() - new Date(e.started_at).getTime()) / 60_000)
        );
        lines.push(`${start} - 実行中 ${e.label}（経過${elapsed}分）`);
      }
    }
  } else {
    lines.push("(計測なし)");
  }

  lines.push("");
  lines.push("振り返り");
  lines.push(`・タスク達成率 ${achievementRate(plan, tasksById, review)}%`);
  lines.push("・理由");
  lines.push(
    review.failure_reasons.length
      ? review.failure_reasons
          .map((r) => FAILURE_REASON_LABELS[r] ?? r)
          .join("、")
      : "未入力"
  );
  lines.push("・改善点");
  lines.push(review.reflection_text.trim() || "未入力");

  return lines.join("\n");
}

/**
 * 達成率: 計画アイテムのうち、紐づくタスクが完了した割合。
 * タスク紐付きの計画がない場合は minimum_completed から概算する。
 */
function achievementRate(
  plan: DailyPlanRow | null,
  tasksById: Map<string, Task>,
  review: ReviewExportInput["review"]
): number {
  const items = [
    ...(plan?.minimum_plan_json ?? []),
    ...(plan?.standard_plan_json ?? []),
    ...(plan?.stretch_plan_json ?? []),
  ];
  const linked = items.filter((i) => i.task_id);
  if (linked.length > 0) {
    const done = linked.filter(
      (i) => tasksById.get(i.task_id!)?.status === "done"
    ).length;
    return Math.round((done / linked.length) * 100);
  }
  if (review.minimum_completed === "completed") return 100;
  if (review.minimum_completed === "partial") return 50;
  return 0;
}
