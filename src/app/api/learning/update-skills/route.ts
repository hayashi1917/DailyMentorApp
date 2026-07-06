import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { isRuleTextSafe, skillUpdateSchema } from "@/lib/schemas";
import { addDays, getTodayDate } from "@/lib/date";
import type { AgentSkill, FeedbackEvent, UserMemory } from "@/lib/types";

const SKILL_SAFETY_RULES = `Skillルール作成時の禁止事項(絶対に守ること):
- ユーザーを責めるルール
- 過度に追い込むルール(「限界まで」「絶対に全部やる」など)
- 睡眠や食事を削る前提のルール
- 未完了を罰するルール
- 重要操作をユーザー承認なしで行うルール
- APIキーや個人情報を出力するルール
- シェル実行やローカルファイル操作を前提にするルール
- 第三者Skillを自動で読み込むルール

更新の方針:
- 小さく更新する(1回の更新は最大3件まで)
- 根拠となるフィードバックやレビューがあるものだけ更新する
- 十分な根拠がなければ updates は空配列でよい`;

/**
 * Analyze recent feedback + memories and propose small updates to
 * agent_skills. Old versions are kept (is_active=false), never deleted.
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
  const since = addDays(today, -14);

  const [feedbackRes, memoriesRes, skillsRes] = await Promise.all([
    supabase
      .from("feedback_events")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", `${since}T00:00:00+09:00`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("user_memories")
      .select("*")
      .eq("user_id", user.id)
      .order("confidence", { ascending: false })
      .limit(20),
    supabase
      .from("agent_skills")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const feedback = (feedbackRes.data ?? []) as FeedbackEvent[];
  const memories = (memoriesRes.data ?? []) as UserMemory[];
  const activeSkills = (skillsRes.data ?? []) as AgentSkill[];

  if (feedback.length === 0) {
    return NextResponse.json({
      updated: [],
      message: "直近のフィードバックがないため、Skillの更新はありません。",
    });
  }

  const prompt = `あなたはAIメンターの振る舞いルール(agent_skills)を管理するシステムです。
最近のユーザーフィードバックと記憶を分析し、必要であればルールの追加・更新を提案してください。

${SKILL_SAFETY_RULES}

## 現在のアクティブなSkill
${activeSkills.length ? activeSkills.map((s) => `- [id:${s.id}] [${s.skill_name} v${s.version}] ${s.rule_text}`).join("\n") : "なし"}

## 直近14日間のフィードバック
${feedback.map((f) => `- [${f.target_type}] ${f.feedback_type}${f.feedback_text ? `: ${f.feedback_text}` : ""}`).join("\n")}

## ユーザーについての記憶
${memories.length ? memories.map((m) => `- [${m.memory_type}] ${m.content} (確度:${m.confidence})`).join("\n") : "なし"}

## 出力形式(JSONのみ)
{
  "updates": [
    {
      "skill_name": "planning_skill | recovery_skill | task_breakdown_skill | mentor_tone_skill | review_skill",
      "rule_text": "新しいルール本文(日本語、1〜2文、500字以内)",
      "reason": "根拠となるフィードバックの要約",
      "replaces_skill_id": "既存Skillを置き換える場合はそのid(新規追加なら省略)"
    }
  ],
  "memory_updates": [
    { "memory_type": "rhythm|preference|failure_pattern|success_pattern|task_style|mentor_tone|recovery_strategy", "content": "..." }
  ]
}
根拠が弱ければ updates と memory_updates は空配列にしてください。`;

  let parsed;
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    parsed = skillUpdateSchema.safeParse(JSON.parse(raw));
  } catch (e) {
    console.error("update-skills AI call failed:", e);
    return NextResponse.json(
      { error: "Skill分析に失敗しました。もう一度お試しください。" },
      { status: 502 }
    );
  }

  if (!parsed.success) {
    console.error("update-skills validation failed:", parsed.error);
    return NextResponse.json(
      { error: "AI出力の検証に失敗しました" },
      { status: 502 }
    );
  }

  const activeSkillIds = new Set(activeSkills.map((s) => s.id));
  const applied: { skill_name: string; rule_text: string; version: number }[] =
    [];
  const rejected: { rule_text: string; reason: string }[] = [];

  for (const update of parsed.data.updates) {
    // 安全性チェック: 危険なルールは保存しない
    if (!isRuleTextSafe(update.rule_text)) {
      rejected.push({
        rule_text: update.rule_text,
        reason: "安全性チェックにより拒否されました",
      });
      continue;
    }

    let version = 1;

    if (
      update.replaces_skill_id &&
      activeSkillIds.has(update.replaces_skill_id)
    ) {
      const old = activeSkills.find((s) => s.id === update.replaces_skill_id)!;
      version = old.version + 1;
      // 旧バージョンは削除せず非アクティブ化して履歴を残す
      await supabase
        .from("agent_skills")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", old.id)
        .eq("user_id", user.id);
    } else {
      const sameName = activeSkills.filter(
        (s) => s.skill_name === update.skill_name
      );
      if (sameName.length > 0) {
        version = Math.max(...sameName.map((s) => s.version)) + 1;
      }
    }

    const { error } = await supabase.from("agent_skills").insert({
      user_id: user.id,
      skill_name: update.skill_name,
      rule_text: update.rule_text,
      is_active: true,
      version,
      created_from: "feedback",
    });

    if (!error) {
      applied.push({
        skill_name: update.skill_name,
        rule_text: update.rule_text,
        version,
      });
    }
  }

  // memory_updates: 既存と同一内容ならevidenceを加算、なければ新規作成
  for (const mem of parsed.data.memory_updates) {
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id, confidence, evidence_count")
      .eq("user_id", user.id)
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
    } else {
      await supabase.from("user_memories").insert({
        user_id: user.id,
        memory_type: mem.memory_type,
        content: mem.content,
        confidence: 0.5,
        evidence_count: 1,
      });
    }
  }

  return NextResponse.json({
    updated: applied,
    rejected,
    memoryUpdates: parsed.data.memory_updates.length,
  });
}
