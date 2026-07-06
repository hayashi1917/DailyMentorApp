import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { MENTOR_PERSONA } from "@/lib/mentor-context";
import type { AgentSkill, Task, UserMemory } from "@/lib/types";

const breakdownInputSchema = z.object({
  task_id: z.string().uuid(),
});

const breakdownOutputSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        estimated_minutes: z.number().int().min(5).max(60),
        next_action: z.string().max(300).optional(),
        recovery_action: z.string().max(300).optional(),
        difficulty: z.enum(["low", "medium", "high"]).default("low"),
      })
    )
    .min(2)
    .max(6),
  rationale: z.string().max(500),
});

export type BreakdownProposal = z.infer<typeof breakdownOutputSchema>;

/**
 * Proposes a breakdown of a task into small steps.
 * Nothing is written to the DB here: the client shows the proposal and
 * only saves it (as child tasks) after the user approves.
 */
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

  const parsed = breakdownInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const [taskRes, memoriesRes, skillsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("id", parsed.data.task_id)
      .maybeSingle(),
    supabase
      .from("user_memories")
      .select("*")
      .eq("user_id", user.id)
      .in("memory_type", ["task_style", "failure_pattern", "success_pattern"])
      .order("confidence", { ascending: false })
      .limit(10),
    supabase
      .from("agent_skills")
      .select("*")
      .eq("user_id", user.id)
      .eq("skill_name", "task_breakdown_skill")
      .eq("is_active", true),
  ]);

  const task = taskRes.data as Task | null;
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const memories = (memoriesRes.data ?? []) as UserMemory[];
  const skills = (skillsRes.data ?? []) as AgentSkill[];

  const prompt = `次のタスクを、迷わず着手できる小さなステップに分解してください。

## タスク
- タイトル: ${task.title}
- メモ: ${task.description ?? "なし"}
- 見積: ${task.estimated_minutes ? `${task.estimated_minutes}分` : "不明"}
- 重さ: ${task.difficulty}
- 締切: ${task.deadline ? task.deadline.slice(0, 10) : "なし"}

## ユーザーのタスクの進め方に関する記憶
${memories.length ? memories.map((m) => `- [${m.memory_type}] ${m.content}`).join("\n") : "なし"}

## タスク分解の振る舞いルール(必ず従うこと)
${skills.length ? skills.map((s) => `- ${s.rule_text}`).join("\n") : "- 最初のステップは5〜10分で終わる、心理的に軽いものにする"}

## 分解の方針
- 2〜6ステップに分解する
- 各ステップは5〜60分で完了できるサイズにする
- 最初のステップは特に小さく、始めるハードルを下げる
- 各ステップに、調子が出ない日用の recovery_action(5分以内の代替行動)を付けられるなら付ける
- 順番に実行すれば元のタスクが完了する構成にする

## 出力形式(JSONのみ)
{
  "steps": [
    {
      "title": "ステップ名",
      "estimated_minutes": 10,
      "next_action": "最初にやる具体的な操作(任意)",
      "recovery_action": "調子が出ない日の最小行動(任意)",
      "difficulty": "low | medium | high"
    }
  ],
  "rationale": "この分解にした理由を1〜2文で"
}
すべて日本語で書いてください。`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: MENTOR_PERSONA },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const output = breakdownOutputSchema.safeParse(JSON.parse(raw));
    if (!output.success) {
      console.error("breakdown validation failed:", output.error);
      return NextResponse.json(
        { error: "AI出力の検証に失敗しました。もう一度お試しください。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ proposal: output.data });
  } catch (e) {
    console.error("breakdown failed:", e);
    return NextResponse.json(
      { error: "タスク分解に失敗しました。もう一度お試しください。" },
      { status: 502 }
    );
  }
}
