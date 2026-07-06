export type Priority = "low" | "medium" | "high";
export type Difficulty = "low" | "medium" | "high";
export type TaskStatus = "todo" | "done" | "archived";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  estimated_minutes: number | null;
  priority: Priority;
  difficulty: Difficulty;
  status: TaskStatus;
  next_action: string | null;
  recovery_action: string | null;
  parent_task_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Mood = "good" | "normal" | "bad";
export type PlanType = "attack" | "maintain" | "recovery";
export type FocusArea =
  | "job_hunting"
  | "research"
  | "study"
  | "work"
  | "health"
  | "other";

export type DailyCheckin = {
  id: string;
  user_id: string;
  date: string;
  energy_level: number | null;
  mood: Mood | null;
  focus_area: string | null;
  plan_type: PlanType | null;
  created_at: string;
};

export type PlanItem = {
  task_id?: string;
  title: string;
  estimated_minutes?: number;
  reason?: string;
};

export type IfThenPlan = {
  if: string;
  then: string;
};

export type ScheduleItem = {
  start: string; // "09:00"
  end: string; // "10:00"
  title: string;
};

export type DailyPlanRow = {
  id: string;
  user_id: string;
  date: string;
  policy: string | null;
  minimum_plan_json: PlanItem[] | null;
  standard_plan_json: PlanItem[] | null;
  stretch_plan_json: PlanItem[] | null;
  if_then_plan_json: IfThenPlan[] | null;
  schedule_json: ScheduleItem[] | null;
  mentor_message: string | null;
  is_recovery_mode: boolean;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  task_id: string | null;
  label: string;
  date: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export type MinimumCompleted = "completed" | "partial" | "not_completed";

export type FailureReason =
  | "no_time"
  | "tired"
  | "task_too_heavy"
  | "unclear_priority"
  | "forgot"
  | "no_motivation"
  | "unexpected_event";

export type DailyReview = {
  id: string;
  user_id: string;
  date: string;
  minimum_completed: MinimumCompleted | null;
  completion_score: number | null;
  failure_reasons: string[] | null;
  reflection_text: string | null;
  created_at: string;
};

export type FeedbackTargetType =
  | "daily_plan"
  | "mentor_message"
  | "task_breakdown"
  | "recovery_plan"
  | "other";

export type FeedbackType =
  | "helpful"
  | "not_helpful"
  | "too_heavy"
  | "too_light"
  | "good_timing"
  | "bad_timing"
  | "wrong_priority"
  | "tone_too_strict"
  | "tone_too_soft"
  | "too_long"
  | "other";

export type FeedbackEvent = {
  id: string;
  user_id: string;
  target_type: FeedbackTargetType;
  target_id: string | null;
  feedback_type: FeedbackType;
  feedback_text: string | null;
  created_at: string;
};

export type MemoryType =
  | "rhythm"
  | "preference"
  | "failure_pattern"
  | "success_pattern"
  | "task_style"
  | "mentor_tone"
  | "recovery_strategy";

export type UserMemory = {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  evidence_count: number;
  last_observed_at: string;
  created_at: string;
  updated_at: string;
};

// メンターチャットでAIが実行した操作(UIにチップ表示・DBに記録)
export type MentorAction =
  | { type: "tasks_created"; titles: string[] }
  | { type: "task_updated"; title: string }
  | { type: "plan_updated"; date: string }
  | { type: "memory_saved"; content: string };

export type MentorMessageRow = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  actions_json: MentorAction[] | null;
  created_at: string;
};

export type LifestylePattern = {
  id: string;
  user_id: string;
  pattern_key: string;
  value: number;
  sample_size: number;
  updated_at: string;
};

export type SkillName =
  | "planning_skill"
  | "recovery_skill"
  | "task_breakdown_skill"
  | "mentor_tone_skill"
  | "review_skill";

export type AgentSkill = {
  id: string;
  user_id: string;
  skill_name: SkillName;
  rule_text: string;
  is_active: boolean;
  version: number;
  created_from: "default" | "feedback" | "behavior_log" | "manual";
  created_at: string;
  updated_at: string;
};
