import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { feedbackAnalysisSchema, feedbackInputSchema } from "@/lib/schemas";
import { embedMemoryRow } from "@/lib/embeddings";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";

const TARGET_TYPE_LABELS: Record<string, string> = {
  daily_plan: "今日の計画",
  mentor_message: "メンターからのコメント",
  task_breakdown: "タスクの分解結果",
  recovery_plan: "復帰プラン",
  other: "提案",
};

/**
 * 自由記述フィードバックから、今後の計画・メンタリングに使う記憶を
 * 0〜2件抽出して user_memories に保存する。best-effort(失敗しても
 * フィードバック自体の保存は成功扱い)。学習した内容を返す。
 */
async function distillFreeTextFeedback(
  supabase: SupabaseClient,
  userId: string,
  targetType: string,
  text: string
): Promise<string[]> {
  const prompt = `ユーザーが、AIメンターの「${TARGET_TYPE_LABELS[targetType] ?? "提案"}」に対して次のフィードバックを書きました。

"""
${text}
"""

今後の計画づくりやメンタリングに活かすため、ユーザーに関する記憶として保存すべき内容を0〜2件抽出してください。

ルール:
- ユーザーの好み・生活リズム・失敗/成功パターン・口調の好みなど、今後も繰り返し使える一般化できる内容だけを抽出する
- 「今日は病院がある」のような一時的な事情は保存しない(0件でよい)
- ユーザーを責める表現・断定しすぎる表現にしない
- 各contentは日本語1文、100文字以内

出力形式(JSONのみ):
{"memories":[{"memory_type":"rhythm|preference|failure_pattern|success_pattern|task_style|mentor_tone|recovery_strategy","content":"..."}]}
該当がなければ {"memories":[]} を返してください。`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = feedbackAnalysisSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("feedback analysis validation failed:", parsed.error);
    return [];
  }

  const learned: string[] = [];
  for (const mem of parsed.data.memories) {
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id, confidence, evidence_count")
      .eq("user_id", userId)
      .eq("memory_type", mem.memory_type)
      .eq("content", mem.content)
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
      learned.push(mem.content);
    } else {
      const { data: inserted } = await supabase
        .from("user_memories")
        .insert({
          user_id: userId,
          memory_type: mem.memory_type,
          content: mem.content,
          // 本人の言葉由来なのでヒューリスティックより高めの初期確度
          confidence: 0.7,
          evidence_count: 1,
        })
        .select("id")
        .single();
      if (inserted) {
        await embedMemoryRow(supabase, inserted.id, mem.content);
        learned.push(mem.content);
      }
    }
  }
  return learned;
}

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

  // 自由記述の場合は、AIで記憶を抽出して即時反映する(best-effort)
  let learned: string[] = [];
  if (input.is_free_text && input.feedback_text?.trim()) {
    try {
      learned = await distillFreeTextFeedback(
        supabase,
        user.id,
        input.target_type,
        input.feedback_text.trim()
      );
    } catch (e) {
      console.error("distillFreeTextFeedback failed:", e);
    }
  }

  // 同種のフィードバックが繰り返された場合のみ user_memories を更新する
  // (1回のフィードバックで確信するのではなく、evidence を積み上げる)
  const candidate = MEMORY_CANDIDATES[input.feedback_type];
  let memoryUpdated = learned.length > 0;

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
        const { data: inserted } = await supabase
          .from("user_memories")
          .insert({
            user_id: user.id,
            memory_type: candidate.memory_type,
            content: candidate.content,
            confidence: 0.5,
            evidence_count: count ?? 2,
          })
          .select("id")
          .single();
        if (inserted) {
          await embedMemoryRow(supabase, inserted.id, candidate.content);
        }
        memoryUpdated = true;
      }
    }
  }

  return NextResponse.json({ feedback: saved, memoryUpdated, learned });
}
