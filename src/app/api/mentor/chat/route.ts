import { NextResponse } from "next/server";
import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import {
  chatCreateTasksArgsSchema,
  chatGeneratePlanArgsSchema,
  chatSaveMemoryArgsSchema,
  chatUpdateTaskArgsSchema,
  mentorChatInputSchema,
} from "@/lib/schemas";
import { getTodayDate } from "@/lib/date";
import { searchRelevantMemories } from "@/lib/embeddings";
import { upsertUserMemory } from "@/lib/memories";
import { generateAndSaveDailyPlan } from "@/lib/plan";
import type { DailyPlanRow, MentorAction, MentorMessageRow } from "@/lib/types";
import {
  formatContextForPrompt,
  gatherMentorContext,
  MENTOR_PERSONA,
} from "@/lib/mentor-context";

// 1ターンあたりのツール実行ループ上限(暴走防止)
const MAX_TOOL_ROUNDS = 5;
// エージェントに渡す会話履歴の件数
const HISTORY_FOR_AGENT = 16;
// UIに返す会話履歴の件数
const HISTORY_FOR_UI = 40;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_tasks",
      description:
        "会話で確定した新しいタスクを登録する。ユーザーがやりたいこと・やるべきことを話したら、内容を確認したうえで登録する。既に同名のタスクがある場合は登録しない。",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "実行可能な粒度のタスク名" },
                estimated_minutes: { type: "integer", description: "見積(分)" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                difficulty: { type: "string", enum: ["high", "medium", "low"] },
                deadline: {
                  type: "string",
                  description: "締切 YYYY-MM-DD(会話から読み取れる場合のみ)",
                },
                description: { type: "string" },
                next_action: {
                  type: "string",
                  description: "最初の一歩(5〜15分でできる具体的行動)",
                },
                recovery_action: {
                  type: "string",
                  description: "崩れた日の復帰用の最小行動",
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "既存タスクを更新する(締切・見積・優先度の変更、完了(status=done)、アーカイブなど)。task_id はコンテキストの未完了タスクの [id:...] を使う。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "タスクのUUID" },
          title: { type: "string" },
          estimated_minutes: { type: "integer" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          difficulty: { type: "string", enum: ["high", "medium", "low"] },
          deadline: {
            type: ["string", "null"],
            description: "YYYY-MM-DD。null で締切を外す",
          },
          status: { type: "string", enum: ["todo", "done", "archived"] },
          next_action: { type: ["string", "null"] },
          recovery_action: { type: ["string", "null"] },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_daily_plan",
      description:
        "今日の計画(最低/標準/余裕ライン+時刻つきスケジュール)を生成・再生成して保存する。会話でユーザーが伝えた事情・希望は instructions に日本語でまとめて渡す。計画の調整依頼(「午後は軽めに」など)もこのツールで再生成する。",
      parameters: {
        type: "object",
        properties: {
          instructions: {
            type: "string",
            description:
              "計画への指示。例:「午前は病院なので午後中心。ESを最優先。夜は軽いタスクのみ」",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "ユーザーが今後も繰り返し使える好み・生活リズム・成功/失敗パターンを話したときに、長期記憶として保存する。「今日は病院」のような一時的な事情は保存しない。",
      parameters: {
        type: "object",
        properties: {
          memory_type: {
            type: "string",
            enum: [
              "rhythm",
              "preference",
              "failure_pattern",
              "success_pattern",
              "task_style",
              "mentor_tone",
              "recovery_strategy",
            ],
          },
          content: {
            type: "string",
            description: "日本語1文・100文字以内。断定しすぎない表現にする",
          },
        },
        required: ["memory_type", "content"],
      },
    },
  },
];

/** ツールを実行し、モデルに返す結果文字列を返す。実行内容は actions に積む。 */
async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  timezone: string | undefined,
  name: string,
  rawArgs: string,
  actions: MentorAction[]
): Promise<string> {
  let args: unknown;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return JSON.stringify({ error: "引数のJSONが不正です" });
  }

  switch (name) {
    case "create_tasks": {
      const parsed = chatCreateTasksArgsSchema.safeParse(args);
      if (!parsed.success) {
        return JSON.stringify({ error: "引数の検証に失敗しました" });
      }
      const rows = parsed.data.tasks.map((t) => ({
        user_id: userId,
        title: t.title,
        description: t.description ?? null,
        estimated_minutes: t.estimated_minutes ?? null,
        priority: t.priority,
        difficulty: t.difficulty,
        deadline: t.deadline
          ? new Date(`${t.deadline}T23:59:59+09:00`).toISOString()
          : null,
        next_action: t.next_action ?? null,
        recovery_action: t.recovery_action ?? null,
        status: "todo" as const,
      }));
      const { data, error } = await supabase
        .from("tasks")
        .insert(rows)
        .select("id, title");
      if (error || !data) {
        console.error("chat create_tasks failed:", error);
        return JSON.stringify({ error: "タスクの保存に失敗しました" });
      }
      actions.push({ type: "tasks_created", titles: data.map((d) => d.title) });
      return JSON.stringify({
        created: data.map((d) => ({ id: d.id, title: d.title })),
      });
    }

    case "update_task": {
      const parsed = chatUpdateTaskArgsSchema.safeParse(args);
      if (!parsed.success) {
        return JSON.stringify({ error: "引数の検証に失敗しました" });
      }
      const { task_id, deadline, status, ...rest } = parsed.data;
      const patch: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      };
      if (deadline !== undefined) {
        patch.deadline = deadline
          ? new Date(`${deadline}T23:59:59+09:00`).toISOString()
          : null;
      }
      if (status !== undefined) {
        patch.status = status;
        patch.completed_at = status === "done" ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", task_id)
        .eq("user_id", userId)
        .select("id, title, status")
        .maybeSingle();
      if (error || !data) {
        console.error("chat update_task failed:", error);
        return JSON.stringify({
          error: "タスクが見つからないか、更新に失敗しました",
        });
      }
      actions.push({ type: "task_updated", title: data.title });
      return JSON.stringify({ updated: data });
    }

    case "generate_daily_plan": {
      const parsed = chatGeneratePlanArgsSchema.safeParse(args);
      if (!parsed.success) {
        return JSON.stringify({ error: "引数の検証に失敗しました" });
      }
      const result = await generateAndSaveDailyPlan(supabase, userId, {
        timezone,
        instructions: parsed.data.instructions,
      });
      if (!result.ok) {
        return JSON.stringify({ error: result.error });
      }
      actions.push({ type: "plan_updated", date: result.plan.date });
      const summary = (items: DailyPlanRow["minimum_plan_json"]) =>
        (items ?? []).map((i) => i.title).join(" / ") || "なし";
      return JSON.stringify({
        saved: true,
        policy: result.plan.policy,
        minimum_plan: summary(result.plan.minimum_plan_json),
        standard_plan: summary(result.plan.standard_plan_json),
        stretch_plan: summary(result.plan.stretch_plan_json),
        schedule: (result.plan.schedule_json ?? [])
          .map((s) => `${s.start}-${s.end} ${s.title}`)
          .join(" / "),
        is_recovery_mode: result.plan.is_recovery_mode,
      });
    }

    case "save_memory": {
      const parsed = chatSaveMemoryArgsSchema.safeParse(args);
      if (!parsed.success) {
        return JSON.stringify({ error: "引数の検証に失敗しました" });
      }
      // 本人の言葉由来なのでヒューリスティックより高めの初期確度
      const ok = await upsertUserMemory(
        supabase,
        userId,
        parsed.data.memory_type,
        parsed.data.content,
        0.7
      );
      if (!ok) return JSON.stringify({ error: "記憶の保存に失敗しました" });
      actions.push({ type: "memory_saved", content: parsed.data.content });
      return JSON.stringify({ saved: true });
    }

    default:
      return JSON.stringify({ error: `未知のツール: ${name}` });
  }
}

/** 会話履歴の取得(UI表示用)。 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mentor_messages")
    .select("id, role, content, actions_json, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_FOR_UI);

  if (error) {
    console.error("mentor messages fetch failed:", error);
    return NextResponse.json({ error: "履歴の取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []).reverse() });
}

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

  const message = parsed.data.message;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const timezone = profile?.timezone ?? undefined;
  const today = getTodayDate(timezone);

  const [ctx, planRes, relevantMemories, historyRes] = await Promise.all([
    gatherMentorContext(supabase, user.id, today),
    supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    // pgvectorで発言内容に関連する長期記憶を検索(未設定時は空配列)
    searchRelevantMemories(supabase, message, 5),
    // 会話履歴はDBから復元する(端末をまたいでも文脈が続く)
    supabase
      .from("mentor_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_FOR_AGENT),
  ]);

  const plan = planRes.data as DailyPlanRow | null;
  const history = (
    (historyRes.data ?? []) as Pick<MentorMessageRow, "role" | "content">[]
  ).reverse();

  const planSection = plan
    ? `## 今日の計画\n方針: ${plan.policy}\n` +
      `最低ライン: ${(plan.minimum_plan_json ?? []).map((i) => i.title).join(" / ")}\n` +
      `標準ライン: ${(plan.standard_plan_json ?? []).map((i) => i.title).join(" / ")}\n` +
      `Recovery Mode: ${plan.is_recovery_mode ? "ON" : "OFF"}`
    : "## 今日の計画\nまだ生成されていない";

  const systemPrompt = `${MENTOR_PERSONA}

あなたは会話するだけでなく、ツールで実際に行動できるエージェントです。今日は ${today} です。

ツール使用のルール:
- タスク登録・計画生成は、ユーザーと内容を合意してから実行する。曖昧なら1つだけ質問して確かめる
- ユーザーが「計画を立てて」「予定を組んで」と言ったら generate_daily_plan を使う。会話で聞いた事情(時間の制約・体調・優先したいこと)を instructions にまとめて渡す
- ユーザーがやること・締切を話したら create_tasks でタスク化を提案・実行する(会話に出ていないタスクを発明しない)
- 「終わった」「できた」と言われたら update_task で完了にする
- 今後も使える好み・リズム・パターンを聞いたら save_memory で覚える(一時的な事情は覚えない)
- 実行した内容は返答の中で簡潔に伝える(例:「タスクに追加しました」「計画を組み直しました。今日画面で確認できます」)
- ツールが不要な相談・雑談には普通に返答する

返答のルール:
- 返答は短めにする(2〜4文程度)
- 必要なら「今からやる最小行動」を1つだけ提案する
- ユーザーが落ち込んでいたら、まず受け止める

${planSection}

${
  relevantMemories.length
    ? `## 今の話題に特に関連する記憶(ベクトル検索)\n${relevantMemories
        .map((m) => `- [${m.memory_type}] ${m.content}`)
        .join("\n")}\n\n`
    : ""
}${formatContextForPrompt(ctx)}`;

  const actions: MentorAction[] = [];
  let reply = "";

  try {
    const openai = getOpenAI();
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        // 上限に達したらツールを渡さず、文章での返答を強制する
        ...(round < MAX_TOOL_ROUNDS ? { tools: TOOLS } : {}),
        temperature: 0.7,
        max_tokens: 700,
      });

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      if (msg.tool_calls?.length && round < MAX_TOOL_ROUNDS) {
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          const result = await executeTool(
            supabase,
            user.id,
            timezone,
            tc.function.name,
            tc.function.arguments,
            actions
          );
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        continue;
      }

      reply = msg.content ?? "";
      break;
    }
  } catch (e) {
    console.error("mentor chat failed:", e);
    return NextResponse.json(
      { error: "メンターとの通信に失敗しました" },
      { status: 502 }
    );
  }

  if (!reply) {
    reply = actions.length
      ? "実行しました。他に調整したいことがあれば教えてください。"
      : "うまく返答できませんでした。もう一度送ってみてください。";
  }

  // 会話を永続化する(失敗しても返答は返す)。
  // created_at を明示して user → assistant の順序を保証する
  const now = Date.now();
  const { error: saveError } = await supabase.from("mentor_messages").insert([
    {
      user_id: user.id,
      role: "user",
      content: message,
      created_at: new Date(now).toISOString(),
    },
    {
      user_id: user.id,
      role: "assistant",
      content: reply,
      actions_json: actions.length ? actions : null,
      created_at: new Date(now + 1).toISOString(),
    },
  ]);
  if (saveError) {
    console.error("mentor messages save failed:", saveError);
  }

  return NextResponse.json({ reply, actions });
}
