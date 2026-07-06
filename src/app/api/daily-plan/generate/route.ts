import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { dailyPlanSchema } from "@/lib/schemas";
import { getTodayDate } from "@/lib/date";
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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const today = getTodayDate(profile?.timezone ?? undefined);

  const [ctx, recovery] = await Promise.all([
    gatherMentorContext(supabase, user.id, today),
    judgeRecoveryMode(supabase, user.id, today),
  ]);

  // Googleカレンダー連携済みなら、今日の予定と空き時間を計画に反映する
  let calendarSection = "";
  if (isGoogleConfigured()) {
    try {
      const accessToken = await getAccessToken(supabase, user.id);
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

  const validTaskIds = new Set(ctx.todoTasks.map((t) => t.id));

  const userPrompt = `今日は ${today} です。以下のコンテキストをもとに、今日の計画をJSONで出力してください。

${formatContextForPrompt(ctx)}

${calendarSection ? `${calendarSection}\n\n` : ""}${recoverySection}

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
    return NextResponse.json(
      { error: "AIによる計画生成に失敗しました。もう一度お試しください。" },
      { status: 502 }
    );
  }

  if (!parsed.success) {
    console.error("daily-plan schema validation failed:", parsed.error);
    return NextResponse.json(
      { error: "AI出力の検証に失敗しました。もう一度お試しください。" },
      { status: 502 }
    );
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
    user_id: user.id,
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
    return NextResponse.json(
      { error: "計画の保存に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    plan: saved,
    recovery: { isRecoveryMode: recovery.isRecoveryMode, reasons: recovery.reasons },
  });
}
