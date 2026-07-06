import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { parseTasksOutputSchema } from "@/lib/schemas";
import { getTodayDate } from "@/lib/date";

const parseInputSchema = z.object({
  text: z.string().min(1).max(8000),
});

/**
 * Parses a free-form document (rough task memo) into structured task
 * proposals. Nothing is written to the DB: the client shows editable
 * proposals and saves only what the user approves.
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

  const parsed = parseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const today = getTodayDate();

  const prompt = `あなたはタスク整理の専門家です。以下の文書は、ユーザーが書いた粒度の粗いタスクメモです。
これを、実行可能な粒度のタスクに分解・構造化してください。

## 入力文書
${parsed.data.text}

## 変換ルール
- 今日は ${today} です。「明日」「金曜まで」などの相対表現は具体的な日付(YYYY-MM-DD)に変換する
- S/A/Bなどのランク表記があれば priority に反映する(S→high, A→medium, B→low)
- (4H)(2h)(30分)などの見積表記があれば estimated_minutes に分単位で変換する
- 1つの項目が大きすぎる場合(2時間超の見込み)は、2〜3個の実行可能なタスクに分割してよい
- 曖昧な項目は、具体的な行動がわかるタイトルに言い換える(例:「日立」→「日立 ESを書く」)
- 文書に書かれていないタスクを発明しない
- 最大20件まで

## 出力形式(JSONのみ)
{
  "tasks": [
    {
      "title": "タスク名",
      "estimated_minutes": 60,
      "priority": "high | medium | low",
      "difficulty": "high | medium | low",
      "deadline": "YYYY-MM-DD (文書から読み取れる場合のみ)",
      "description": "補足があれば"
    }
  ]
}
すべて日本語で出力してください。`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const output = parseTasksOutputSchema.safeParse(JSON.parse(raw));
    if (!output.success) {
      console.error("parse-tasks validation failed:", output.error);
      return NextResponse.json(
        { error: "AI出力の検証に失敗しました。もう一度お試しください。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ tasks: output.data.tasks });
  } catch (e) {
    console.error("parse-tasks failed:", e);
    return NextResponse.json(
      { error: "タスクの解析に失敗しました。もう一度お試しください。" },
      { status: 502 }
    );
  }
}
