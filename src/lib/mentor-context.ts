import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/date";
import type {
  AgentSkill,
  DailyCheckin,
  DailyReview,
  FeedbackEvent,
  LifestylePattern,
  Task,
  UserMemory,
} from "@/lib/types";

export type MentorContext = {
  checkin: DailyCheckin | null;
  todoTasks: Task[];
  upcomingDeadlineTasks: Task[];
  yesterdayReview: DailyReview | null;
  recentReviews: DailyReview[];
  recentFeedback: FeedbackEvent[];
  memories: UserMemory[];
  patterns: LifestylePattern[];
  activeSkills: AgentSkill[];
};

export async function gatherMentorContext(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<MentorContext> {
  const weekAgo = addDays(today, -7);
  const yesterday = addDays(today, -1);
  const threeDaysLater = addDays(today, 3);

  const [
    checkinRes,
    todoRes,
    deadlineRes,
    reviewsRes,
    feedbackRes,
    memoriesRes,
    patternsRes,
    skillsRes,
  ] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "todo")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(30),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "todo")
      .not("deadline", "is", null)
      .lte("deadline", `${threeDaysLater}T23:59:59+09:00`)
      .order("deadline", { ascending: true })
      .limit(10),
    supabase
      .from("daily_reviews")
      .select("*")
      .eq("user_id", userId)
      .gte("date", weekAgo)
      .order("date", { ascending: false }),
    supabase
      .from("feedback_events")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", `${weekAgo}T00:00:00+09:00`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("user_memories")
      .select("*")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(20),
    supabase.from("lifestyle_patterns").select("*").eq("user_id", userId),
    supabase
      .from("agent_skills")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const recentReviews = (reviewsRes.data ?? []) as DailyReview[];

  return {
    checkin: (checkinRes.data as DailyCheckin | null) ?? null,
    todoTasks: (todoRes.data ?? []) as Task[],
    upcomingDeadlineTasks: (deadlineRes.data ?? []) as Task[],
    yesterdayReview: recentReviews.find((r) => r.date === yesterday) ?? null,
    recentReviews,
    recentFeedback: (feedbackRes.data ?? []) as FeedbackEvent[],
    memories: (memoriesRes.data ?? []) as UserMemory[],
    patterns: (patternsRes.data ?? []) as LifestylePattern[],
    activeSkills: (skillsRes.data ?? []) as AgentSkill[],
  };
}

function taskLine(t: Task): string {
  const parts = [
    `- [id:${t.id}] ${t.title}`,
    `優先度:${t.priority}`,
    `重さ:${t.difficulty}`,
  ];
  if (t.estimated_minutes) parts.push(`見積:${t.estimated_minutes}分`);
  if (t.deadline) parts.push(`締切:${t.deadline.slice(0, 10)}`);
  if (t.next_action) parts.push(`次の一歩:${t.next_action}`);
  if (t.recovery_action) parts.push(`復帰用の最小行動:${t.recovery_action}`);
  return parts.join(" / ");
}

export function formatContextForPrompt(ctx: MentorContext): string {
  const sections: string[] = [];

  if (ctx.checkin) {
    sections.push(
      `## 今日の朝チェックイン\n` +
        `- エネルギー: ${ctx.checkin.energy_level ?? "不明"}/5\n` +
        `- 気分: ${ctx.checkin.mood ?? "不明"}\n` +
        `- 今日の重点領域: ${ctx.checkin.focus_area ?? "不明"}\n` +
        `- 本人が選んだモード: ${ctx.checkin.plan_type ?? "不明"}`
    );
  } else {
    sections.push("## 今日の朝チェックイン\n未入力");
  }

  sections.push(
    `## 未完了タスク (${ctx.todoTasks.length}件)\n` +
      (ctx.todoTasks.length
        ? ctx.todoTasks.slice(0, 20).map(taskLine).join("\n")
        : "なし")
  );

  if (ctx.upcomingDeadlineTasks.length) {
    sections.push(
      `## 締切が近いタスク(3日以内)\n` +
        ctx.upcomingDeadlineTasks.map(taskLine).join("\n")
    );
  }

  if (ctx.yesterdayReview) {
    const r = ctx.yesterdayReview;
    sections.push(
      `## 昨日のレビュー\n` +
        `- 最低ライン: ${r.minimum_completed ?? "不明"}\n` +
        `- スコア: ${r.completion_score ?? "不明"}\n` +
        `- 失敗理由: ${(r.failure_reasons ?? []).join(", ") || "なし"}\n` +
        `- ふりかえり: ${r.reflection_text || "なし"}`
    );
  }

  if (ctx.recentReviews.length) {
    sections.push(
      `## 直近7日間のレビュー\n` +
        ctx.recentReviews
          .map(
            (r) =>
              `- ${r.date}: 最低ライン=${r.minimum_completed ?? "?"} スコア=${r.completion_score ?? "?"} 理由=[${(r.failure_reasons ?? []).join(",")}]`
          )
          .join("\n")
    );
  }

  if (ctx.recentFeedback.length) {
    sections.push(
      `## 直近7日間のAI提案へのフィードバック\n` +
        ctx.recentFeedback
          .map(
            (f) =>
              `- ${f.created_at.slice(0, 10)} [${f.target_type}] ${f.feedback_type}${f.feedback_text ? `: ${f.feedback_text}` : ""}`
          )
          .join("\n")
    );
  }

  if (ctx.memories.length) {
    sections.push(
      `## ユーザーについての記憶 (user_memories)\n` +
        ctx.memories
          .map(
            (m) =>
              `- [${m.memory_type}] ${m.content} (確度:${m.confidence}, 観測回数:${m.evidence_count})`
          )
          .join("\n")
    );
  }

  if (ctx.patterns.length) {
    sections.push(
      `## 生活リズムの統計 (lifestyle_patterns)\n` +
        ctx.patterns
          .map(
            (p) =>
              `- ${p.pattern_key}: ${Number(p.value).toFixed(2)} (サンプル数:${p.sample_size})`
          )
          .join("\n")
    );
  }

  if (ctx.activeSkills.length) {
    sections.push(
      `## メンターの振る舞いルール (agent_skills, 必ず従うこと)\n` +
        ctx.activeSkills
          .map((s) => `- [${s.skill_name} v${s.version}] ${s.rule_text}`)
          .join("\n")
    );
  }

  return sections.join("\n\n");
}

export const MENTOR_PERSONA = `あなたは「Daily Mentor Agent」。日々のタスク管理と習慣化に伴走するメンターです。
必ず守ること:
- ユーザーを絶対に責めない。できなかった日を否定しない
- 命令口調にしない。「〜すべき」ではなく「〜すると戻りやすい」と伝える
- 3日坊主を防ぐことが最優先。完璧より継続
- 最低ラインはかなり小さく、標準ラインは現実的に、余裕ラインは余力がある場合だけ
- 未完了タスクを全部今日に詰め込まない
- 失敗のあとは「取り返す日」ではなく「復帰する日」と表現する
- Recovery Modeでは通常タスクより recovery_action(復帰用の最小行動)を優先する
- user_memories / lifestyle_patterns / agent_skills の内容を自然に反映する(ルールの引用はしない)`;
