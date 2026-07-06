import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { dailyPlanSchema } from "@/lib/schemas";
import { addDays, getTodayDate } from "@/lib/date";
import { judgeRecoveryMode } from "@/lib/recovery";
import {
  computeFreeSlots,
  getAccessToken,
  isGoogleConfigured,
  listEvents,
} from "@/lib/google";
import {
  formatContextForPrompt,
  gatherMentorContext,
  MENTOR_PERSONA,
} from "@/lib/mentor-context";
import type { DailyPlanRow, MentorMessageRow } from "@/lib/types";

export type GeneratePlanResult =
  | {
      ok: true;
      plan: DailyPlanRow;
      recovery: { isRecoveryMode: boolean; reasons: string[] };
    }
  | { ok: false; error: string };

/**
 * 直近3日間のメンターとの会話を、計画生成プロンプト用に整形する。
 * 会話でユーザーが話した事情・希望が次の計画に反映される。
 */
async function gatherConversationSection(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<string> {
  const threeDaysAgo = addDays(today, -3);
  const { data } = await supabase
    .from("mentor_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .gte("created_at", `${threeDaysAgo}T00:00:00+09:00`)
    .order("created_at", { ascending: false })
    .limit(40);

  const messages = (
    (data ?? []) as Pick<MentorMessageRow, "role" | "content" | "created_at">[]
  ).reverse();
  if (!messages.length) return "";

  const lines = messages.map((m) => {
    const date = m.created_at.slice(0, 10);
    const who = m.role === "user" ? "ユーザー" : "メンター";
    // メンター側は長くなりがちなので短く切り詰める
    const text =
      m.role === "assistant" && m.content.length > 120
        ? `${m.content.slice(0, 120)}…`
        : m.content.slice(0, 400);
    return `- [${date}] ${who}: ${text.replace(/\n+/g, " ")}`;
  });

  return (
    `## 最近のメンターチャットでの会話(直近3日)\n` +
    `会話でユーザーが伝えた事情・希望・気分を計画に反映してください。\n` +
    lines.join("\n")
  );
}

/**
 * 今日の計画を生成して daily_plans に upsert する。
 * `instructions` にはチャットでユーザーと合意した計画への指示を渡せる
 * (例:「午前は病院なので午後中心に」「ESを最優先に」)。
 */
export async function generateAndSaveDailyPlan(
  supabase: SupabaseClient,
  userId: string,
  options: { timezone?: string; instructions?: string } = {}
): Promise<GeneratePlanResult> {
  const today = getTodayDate(options.timezone);

  const [ctx, recovery, conversationSection] = await Promise.all([
    gatherMentorContext(supabase, userId, today),
    judgeRecoveryMode(supabase, userId, today),
    gatherConversationSection(supabase, userId, today),
  ]);

  // Googleカレンダー連携済みなら、今日の予定と空き時間を計画に反映する
  let calendarSection = "";
  if (isGoogleConfigured()) {
    try {
      const accessToken = await getAccessToken(supabase, userId);
      if (accessToken) {
        const events = await listEvents(
          accessToken,
          `${today}T00:00:00+09:00`,
          `${today}T23:59:59+09:00`
        );
        const slots = computeFreeSlots(events, today);
        const fmt = (iso: string) =>
          new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(iso));
        calendarSection =
          `## 今日のカレンダー\n` +
          `予定:\n` +
          (events.length
            ? events
                .map((e) =>
                  e.allDay
                    ? `- (終日) ${e.summary}`
                    : `- ${fmt(e.start)}〜${fmt(e.end)} ${e.summary}`
                )
                .join("\n")
            : "- なし") +
          `\n\nこれからの空き時間:\n` +
          (slots.length
            ? slots
                .map((s) => `- ${fmt(s.start)}〜${fmt(s.end)} (${s.minutes}分)`)
                .join("\n")
            : "- ほとんどなし") +
          `\n\n計画は空き時間の合計に収まる量にし、大きな空き時間に重めの作業を割り当ててください。`;
      }
    } catch (e) {
      // 403はGoogle CloudでCalendar APIが未有効の場合に多い。計画生成は続行する
      console.error(
        "calendar context failed (continuing without it). " +
          "If this is a 403, enable the Google Calendar API in Google Cloud Console:",
        e
      );
    }
  }

  const recoverySection = recovery.isRecoveryMode
    ? `## Recovery Mode 判定: ON\n理由: ${recovery.reasons.join(" / ")}\n` +
      `Recovery Modeの計画ルール:\n` +
      `- minimum_plan は1〜2個まで、1つあたり5〜15分程度\n` +
      `- recovery_action が設定されているタスクはそれを優先する\n` +
      `- standard_plan / stretch_plan はごく控えめにする(空でもよい)\n` +
      `- mentor_message は短く、安心感のある文面にする\n` +
      `- 「今日は取り返す日ではなく、復帰する日」という趣旨を必ず含める`
    : `## Recovery Mode 判定: OFF`;

  const instructionsSection = options.instructions?.trim()
    ? `## ユーザーからの直接の指示(チャットで合意した内容。最優先で反映すること)\n${options.instructions.trim()}`
    : "";

  const validTaskIds = new Set(ctx.todoTasks.map((t) => t.id));

  const userPrompt = `今日は ${today} です。以下のコンテキストをもとに、今日の計画をJSONで出力してください。

${formatContextForPrompt(ctx)}

${conversationSection ? `${conversationSection}\n\n` : ""}${calendarSection ? `${calendarSection}\n\n` : ""}${instructionsSection ? `${instructionsSection}\n\n` : ""}${recoverySection}

## 出力形式
次のJSONスキーマに厳密に従ってください。他のテキストは一切出力しないでください。
{
  "policy": "今日の方針を1〜2文で",
  "minimum_plan": [{ "task_id": "既存タスクのUUID(該当があれば)", "title": "...", "estimated_minutes": 10, "reason": "..." }],
  "standard_plan": [同上],
  "stretch_plan": [同上],
  "if_then_plans": [{ "if": "もし〜なら", "then": "〜する" }],
  "schedule": [{ "start": "09:00", "end": "10:00", "title": "..." }],
  "mentor_message": "短いメンターからの一言"
}

制約:
- minimum_plan は必ず1件以上。合計30分以内を目安に、かなり小さくする
- standard_plan は現実的な量にする(未完了タスクを全部入れない)
- stretch_plan は余力がある場合だけの内容にする
- 計画は必ず上記の「未完了タスク」の中から選んで組む。ユーザーが登録していないタスクを発明しない(休憩・食事などの生活ブロックは schedule のみに置く)
- task_id は、上記の未完了タスクの [id:...] に書かれたUUIDを一字一句そのままコピーした場合のみ含める。それ以外では task_id キー自体を出力しない
- schedule は今日1日の実行計画を時系列で並べる。タスクだけでなく、食事・移動・休憩などの生活ブロックも含める。カレンダーの予定・空き時間と矛盾させない。現在時刻より前の時間帯は入れない
- schedule の時刻は "HH:MM" 形式(例 "09:00")
- 「ユーザーからの直接の指示」と「最近の会話」でユーザーが伝えた希望を最優先で計画に反映する(例: 時間帯の好み、量の調整、タスクの組み方)
- 「直近7日間のAI提案へのフィードバック」に自由記述がある場合は、その要望も計画に反映する
- すべて日本語で書く`;

  let parsed;
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: MENTOR_PERSONA },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    parsed = dailyPlanSchema.safeParse(JSON.parse(raw));
  } catch (e) {
    console.error("daily-plan generate failed:", e);
    return {
      ok: false,
      error: "AIによる計画生成に失敗しました。もう一度お試しください。",
    };
  }

  if (!parsed.success) {
    console.error("daily-plan schema validation failed:", parsed.error);
    return {
      ok: false,
      error: "AI出力の検証に失敗しました。もう一度お試しください。",
    };
  }

  const plan = parsed.data;

  // Strip任意のtask_idがユーザーの実タスクを指していない場合は除去する
  const sanitize = (items: typeof plan.minimum_plan) =>
    items.map((item) =>
      item.task_id && !validTaskIds.has(item.task_id)
        ? { ...item, task_id: undefined }
        : item
    );

  const row = {
    user_id: userId,
    date: today,
    policy: plan.policy,
    minimum_plan_json: sanitize(plan.minimum_plan),
    standard_plan_json: sanitize(plan.standard_plan),
    stretch_plan_json: sanitize(plan.stretch_plan),
    if_then_plan_json: plan.if_then_plans,
    schedule_json: plan.schedule,
    mentor_message: plan.mentor_message,
    is_recovery_mode: recovery.isRecoveryMode,
  };

  const { data: saved, error } = await supabase
    .from("daily_plans")
    .upsert(row, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) {
    console.error("daily-plan save failed:", error);
    return { ok: false, error: "計画の保存に失敗しました" };
  }

  return {
    ok: true,
    plan: saved as DailyPlanRow,
    recovery: {
      isRecoveryMode: recovery.isRecoveryMode,
      reasons: recovery.reasons,
    },
  };
}
