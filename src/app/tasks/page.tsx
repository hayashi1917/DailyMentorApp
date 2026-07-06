"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";
import { DIFFICULTY_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import AppShell from "@/components/AppShell";

function TaskCard({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (task: Task) => void;
}) {
  const done = task.status === "done";
  const deadline = task.deadline ? task.deadline.slice(0, 10) : null;
  const overdue =
    !done && deadline != null && deadline < new Date().toISOString().slice(0, 10);

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        done ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task)}
          aria-label={done ? "未完了に戻す" : "完了にする"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
            done
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-gray-300 bg-white text-transparent"
          }`}
        >
          ✓
        </button>
        <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium ${
              done ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {task.parent_task_id && (
              <span className="mr-1 text-gray-300">└</span>
            )}
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {deadline && (
              <span className={overdue ? "font-medium text-red-500" : ""}>
                📅 {deadline}
              </span>
            )}
            <span>優先度: {PRIORITY_LABELS[task.priority]}</span>
            <span>重さ: {DIFFICULTY_LABELS[task.difficulty]}</span>
            {task.estimated_minutes != null && (
              <span>⏱ {task.estimated_minutes}分</span>
            )}
          </div>
          {!done && task.next_action && (
            <p className="mt-1.5 text-xs text-brand-700">
              👣 次の一歩: {task.next_action}
            </p>
          )}
          {!done && task.recovery_action && (
            <p className="mt-0.5 text-xs text-gray-500">
              🌱 復帰用: {task.recovery_action}
            </p>
          )}
        </Link>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .neq("status", "archived")
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(task: Task) {
    const supabase = createClient();
    const done = task.status === "done";
    const patch = done
      ? { status: "todo", completed_at: null, updated_at: new Date().toISOString() }
      : {
          status: "done",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    // optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? ({ ...t, ...patch } as Task) : t
      )
    );
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) load();
  }

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <AppShell title="タスク">
      {loading ? (
        <p className="mt-8 text-center text-sm text-gray-400">読み込み中...</p>
      ) : (
        <>
          {todoTasks.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-gray-50 px-5 py-8 text-center">
              <p className="text-3xl">🍃</p>
              <p className="mt-2 text-sm text-gray-500">
                未完了のタスクはありません
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {todoTasks.map((t) => (
                <TaskCard key={t.id} task={t} onToggle={toggle} />
              ))}
            </div>
          )}

          {doneTasks.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowDone(!showDone)}
                className="text-sm text-gray-500"
              >
                {showDone ? "▼" : "▶"} 完了済み ({doneTasks.length})
              </button>
              {showDone && (
                <div className="mt-2 space-y-2">
                  {doneTasks.map((t) => (
                    <TaskCard key={t.id} task={t} onToggle={toggle} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Link
        href="/tasks/new"
        className="fixed bottom-24 right-1/2 z-10 flex h-14 w-14 translate-x-[calc(min(50vw,14rem)-1.75rem-1.25rem)] items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg active:bg-brand-700"
        aria-label="タスクを作成"
      >
        ＋
      </Link>
    </AppShell>
  );
}
