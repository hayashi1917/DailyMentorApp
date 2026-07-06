import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { mentorChatInputSchema } from "@/lib/schemas";
import { getTodayDate } from "@/lib/date";
import type { DailyPlanRow } from "@/lib/types";
import {
  formatContextForPrompt,
  gatherMentorContext,
  MENTOR_PERSONA,
} from "@/lib/mentor-context";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = mentorChatInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const today = getTodayDate();

  const [ctx, planRes] = await Promise.all([
    gatherMentorContext(supabase, user.id, today),
    supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
  ]);

  const plan = planRes.data as DailyPlanRow | null;

  const planSection = plan
    ? `## 今日の計画\n方針: ${plan.policy}\n` +
      `最低ライン: ${(plan.minimum_plan_json ?? []).map((i) => i.title).join(" / ")}\n` +
      `標準ライン: ${(plan.standard_plan_json ?? []).map((i) => i.title).join(" / ")}\n` +
      `Recovery Mode: ${plan.is_recovery_mode ? "ON" : "OFF"}`
    : "## 今日の計画\nまだ生成されていない";

  const systemPrompt = `${MENTOR_PERSONA}

追加ルール(チャット時):
- 返答は短めにする(2〜4文程度)
- 必要なら「今からやる最小行動」を1つだけ提案する
- ユーザーが落ち込んでいたら、まず受け止める

${planSection}

${formatContextForPrompt(ctx)}`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...parsed.data.history,
        { role: "user", content: parsed.data.message },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("mentor chat failed:", e);
    return NextResponse.json(
      { error: "メンターとの通信に失敗しました" },
      { status: 502 }
    );
  }
}
