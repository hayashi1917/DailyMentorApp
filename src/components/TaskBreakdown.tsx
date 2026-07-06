"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";
import FeedbackButtons from "@/components/FeedbackButtons";

type Step = {
  title: string;
  estimated_minutes: number;
  next_action?: string;
  recovery_action?: string;
  difficulty: "low" | "medium" | "high";
};

type Proposal = { steps: Step[]; rationale: string };

/**
 * AI task breakdown: fetches a proposal, shows it to the user, and only
 * saves it (as child tasks) after explicit approval.
 */
export default function TaskBreakdown({
  task,
  subtasks,
}: {
  task: Task;
  subtasks: Task[];
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "分解に失敗しました");
        return;
      }
      setProposal(json.proposal);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const rows = proposal.steps.map((s) => ({
      user_id: user.id,
      parent_task_id: task.id,
      title: s.title,
      estimated_minutes: s.estimated_minutes,
      difficulty: s.difficulty,
      priority: task.priority,
      deadline: task.deadline,
      next_action: s.next_action ?? null,
      recovery_action: s.recovery_action ?? null,
    }));

    const { error: dbError } = await supabase.from("tasks").insert(rows);
    setSaving(false);
    if (dbError) {
      setError("保存に失敗しました");
      return;
    }
    setApplied(true);
    setProposal(null);
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">🪄 AIでタスクを分解</h2>

      {subtasks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-400">サブタスク ({subtasks.length})</p>
          <ul className="mt-1.5 space-y-1.5">
            {subtasks.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  s.status === "done"
                    ? "bg-gray-50 text-gray-400 line-through"
                    : "bg-gray-50 text-gray-800"
                }`}
              >
                {s.title}
                {s.estimated_minutes != null && (
                  <span className="ml-2 text-xs text-gray-400">
                    {s.estimated_minutes}分
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {applied && (
        <div className="mt-3">
          <p className="text-xs text-brand-600">
            サブタスクとして保存しました 🌱
          </p>
          <div className="mt-2">
            <FeedbackButtons
              targetType="task_breakdown"
              targetId={task.id}
              title="この分解はどうでしたか？"
              options={[
                { type: "helpful", label: "進めやすそう" },
                { type: "too_heavy", label: "まだ大きい" },
                { type: "too_light", label: "細かすぎる" },
                { type: "wrong_priority", label: "順番が違う" },
              ]}
            />
          </div>
        </div>
      )}

      {proposal ? (
        <div className="mt-3">
          <p className="text-xs text-gray-500">{proposal.rationale}</p>
          <ul className="mt-2 space-y-1.5">
            {proposal.steps.map((s, i) => (
              <li key={i} className="rounded-xl bg-brand-50 px-3 py-2.5">
                <p className="text-sm font-medium text-gray-800">
                  {i + 1}. {s.title}
                  <span className="ml-2 text-xs font-normal text-brand-700">
                    {s.estimated_minutes}分
                  </span>
                </p>
                {s.next_action && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    👣 {s.next_action}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={apply}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "この分解で保存する"}
            </button>
            <button
              onClick={() => setProposal(null)}
              disabled={saving}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600"
            >
              やめる
            </button>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            保存するまでDBには書き込まれません
          </p>
        </div>
      ) : (
        <button
          onClick={propose}
          disabled={loading}
          className="mt-3 w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600 active:bg-brand-50 disabled:opacity-50"
        >
          {loading
            ? "分解を考えています..."
            : subtasks.length > 0
              ? "もう一度分解する"
              : "小さなステップに分解する"}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
