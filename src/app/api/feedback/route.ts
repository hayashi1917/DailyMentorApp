import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { feedbackInputSchema } from "@/lib/schemas";

// Feedback types that suggest a durable user preference worth remembering.
const MEMORY_CANDIDATES: Record<
  string,
  { memory_type: string; content: string } | undefined
> = {
  too_heavy: {
    memory_type: "preference",
    content: "提案された計画を重すぎると感じることがある。計画は小さめが合う",
  },
  too_light: {
    memory_type: "preference",
    content: "提案された計画を軽すぎると感じることがある。もう少し挑戦的でよい",
  },
  tone_too_strict: {
    memory_type: "mentor_tone",
    content: "厳しい口調は合わない。やわらかい表現の方が受け取りやすい",
  },
  tone_too_soft: {
    memory_type: "mentor_tone",
    content: "優しすぎる口調は物足りない。少し率直な表現の方が合う",
  },
  too_long: {
    memory_type: "mentor_tone",
    content: "長いメッセージは読みにくい。短い文面の方が合う",
  },
  bad_timing: {
    memory_type: "rhythm",
    content: "提案された時間帯が生活リズムに合わないことがある",
  },
  wrong_priority: {
    memory_type: "task_style",
    content: "AIの優先順位づけが本人の感覚とずれることがある",
  },
};

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

  const parsed = feedbackInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const { data: saved, error } = await supabase
    .from("feedback_events")
    .insert({
      user_id: user.id,
      target_type: input.target_type,
      target_id: input.target_id ?? null,
      feedback_type: input.feedback_type,
      feedback_text: input.feedback_text ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("feedback save failed:", error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }

  // 同種のフィードバックが繰り返された場合のみ user_memories を更新する
  // (1回のフィードバックで確信するのではなく、evidence を積み上げる)
  const candidate = MEMORY_CANDIDATES[input.feedback_type];
  let memoryUpdated = false;

  if (candidate) {
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id, confidence, evidence_count")
      .eq("user_id", user.id)
      .eq("memory_type", candidate.memory_type)
      .eq("content", candidate.content)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_memories")
        .update({
          evidence_count: existing.evidence_count + 1,
          confidence: Math.min(0.95, Number(existing.confidence) + 0.1),
          last_observed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      memoryUpdated = true;
    } else {
      // 直近30日で同種フィードバックが2回以上あれば記憶として保存する
      const { count } = await supabase
        .from("feedback_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("feedback_type", input.feedback_type)
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );

      if ((count ?? 0) >= 2) {
        await supabase.from("user_memories").insert({
          user_id: user.id,
          memory_type: candidate.memory_type,
          content: candidate.content,
          confidence: 0.5,
          evidence_count: count ?? 2,
        });
        memoryUpdated = true;
      }
    }
  }

  return NextResponse.json({ feedback: saved, memoryUpdated });
}
