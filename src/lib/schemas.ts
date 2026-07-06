import { z } from "zod";

// ------------------------------------------------------------
// AI daily plan output (validated before saving to DB)
// ------------------------------------------------------------
// LLM出力は揺れるため、title以外は不正値でも計画全体を落とさず
// フィールド単位で捨てる(.catch(undefined))。
// task_id の実在チェックはAPI側で validTaskIds と照合して行う。
export const planItemSchema = z.object({
  task_id: z.string().uuid().optional().catch(undefined),
  title: z.string().min(1),
  estimated_minutes: z.number().int().positive().optional().catch(undefined),
  reason: z.string().optional().catch(undefined),
});

export const ifThenPlanSchema = z.object({
  if: z.string().min(1),
  then: z.string().min(1),
});

export const dailyPlanSchema = z.object({
  policy: z.string().min(1),
  minimum_plan: z.array(planItemSchema).min(1),
  standard_plan: z.array(planItemSchema),
  stretch_plan: z.array(planItemSchema),
  if_then_plans: z.array(ifThenPlanSchema),
  mentor_message: z.string().min(1),
});

export type DailyPlanOutput = z.infer<typeof dailyPlanSchema>;

// ------------------------------------------------------------
// AI skill-update output (validated before saving to DB)
// ------------------------------------------------------------
export const SKILL_NAMES = [
  "planning_skill",
  "recovery_skill",
  "task_breakdown_skill",
  "mentor_tone_skill",
  "review_skill",
] as const;

export const skillUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        skill_name: z.enum(SKILL_NAMES),
        rule_text: z.string().min(1).max(500),
        reason: z.string().min(1),
        replaces_skill_id: z.string().uuid().optional(),
      })
    )
    .max(3),
  memory_updates: z
    .array(
      z.object({
        memory_type: z.enum([
          "rhythm",
          "preference",
          "failure_pattern",
          "success_pattern",
          "task_style",
          "mentor_tone",
          "recovery_strategy",
        ]),
        content: z.string().min(1).max(300),
      })
    )
    .max(3),
});

export type SkillUpdateOutput = z.infer<typeof skillUpdateSchema>;

// ------------------------------------------------------------
// API inputs
// ------------------------------------------------------------
export const feedbackInputSchema = z.object({
  target_type: z.enum([
    "daily_plan",
    "mentor_message",
    "task_breakdown",
    "recovery_plan",
    "other",
  ]),
  target_id: z.string().uuid().nullish(),
  feedback_type: z.enum([
    "helpful",
    "not_helpful",
    "too_heavy",
    "too_light",
    "good_timing",
    "bad_timing",
    "wrong_priority",
    "tone_too_strict",
    "tone_too_soft",
    "too_long",
    "other",
  ]),
  feedback_text: z.string().max(1000).nullish(),
});

export const mentorChatInputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .default([]),
});

// ------------------------------------------------------------
// Skill safety: reject dangerous rules regardless of source
// ------------------------------------------------------------
const FORBIDDEN_RULE_PATTERNS: RegExp[] = [
  /罰|ペナルティ|責め|叱|自業自得|怠け|甘え/,
  /睡眠を削|徹夜|寝ない|食事を抜|飯を抜/,
  /追い込|限界まで|絶対にやれ|強制|必ず全部/,
  /api[\s_-]?key|パスワード|秘密鍵|token/i,
  /シェル|shell|exec|ファイル操作|rm\s|sudo/i,
  /外部スキル|サードパーティ|自動で読み込/,
  /承認なし|確認なし|勝手に実行/,
];

export function isRuleTextSafe(ruleText: string): boolean {
  return !FORBIDDEN_RULE_PATTERNS.some((re) => re.test(ruleText));
}
