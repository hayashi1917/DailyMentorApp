export const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  low: "かるい",
  medium: "ふつう",
  high: "おもい",
};

export const MOOD_LABELS: Record<string, string> = {
  good: "😊 良い",
  normal: "😐 ふつう",
  bad: "😞 しんどい",
};

export const FOCUS_AREA_LABELS: Record<string, string> = {
  job_hunting: "就活",
  research: "研究",
  study: "勉強",
  work: "仕事",
  health: "健康",
  other: "その他",
};

export const PLAN_TYPE_LABELS: Record<string, string> = {
  attack: "🔥 攻める日",
  maintain: "🌊 維持する日",
  recovery: "🌱 回復する日",
};

export const MINIMUM_COMPLETED_LABELS: Record<string, string> = {
  completed: "できた",
  partial: "一部できた",
  not_completed: "できなかった",
};

export const FAILURE_REASON_LABELS: Record<string, string> = {
  no_time: "時間がなかった",
  tired: "疲れていた",
  task_too_heavy: "タスクが重すぎた",
  unclear_priority: "優先順位が不明確だった",
  forgot: "忘れていた",
  no_motivation: "やる気が出なかった",
  unexpected_event: "予定外のことが起きた",
};

export const MEMORY_TYPE_LABELS: Record<string, string> = {
  rhythm: "生活リズム",
  preference: "好み",
  failure_pattern: "失敗パターン",
  success_pattern: "成功パターン",
  task_style: "タスクの進め方",
  mentor_tone: "メンターの口調",
  recovery_strategy: "復帰のしかた",
};

export const SKILL_NAME_LABELS: Record<string, string> = {
  planning_skill: "計画Skill",
  recovery_skill: "復帰Skill",
  task_breakdown_skill: "タスク分解Skill",
  mentor_tone_skill: "口調Skill",
  review_skill: "振り返りSkill",
};

export const PATTERN_KEY_LABELS: Record<string, string> = {
  morning_success_rate: "午前の成功率",
  afternoon_success_rate: "午後の成功率",
  evening_success_rate: "夜の成功率",
  heavy_task_evening_failure_rate: "夜の重タスク失敗率",
  minimum_plan_completion_rate: "最低ライン達成率",
  recovery_mode_success_rate: "Recovery Mode成功率",
  review_rate: "レビュー入力率",
  failure_reason_no_time: "失敗理由: 時間がない",
  failure_reason_tired: "失敗理由: 疲れ",
  failure_reason_task_too_heavy: "失敗理由: タスクが重い",
  failure_reason_unclear_priority: "失敗理由: 優先順位が不明確",
  failure_reason_forgot: "失敗理由: 忘れていた",
  failure_reason_no_motivation: "失敗理由: やる気が出ない",
  failure_reason_unexpected_event: "失敗理由: 予定外の出来事",
};

export const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  helpful: "よかった",
  not_helpful: "役に立たなかった",
  too_heavy: "重すぎる",
  too_light: "軽すぎる",
  good_timing: "タイミングがいい",
  bad_timing: "時間帯が合わない",
  wrong_priority: "優先順位が違う",
  tone_too_strict: "厳しすぎる",
  tone_too_soft: "優しすぎる",
  too_long: "長すぎる",
  other: "その他",
};
