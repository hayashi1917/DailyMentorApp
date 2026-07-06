"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500";

export default function TaskForm({ task }: { task?: Task }) {
  const router = useRouter();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [deadline, setDeadline] = useState(
    task?.deadline ? task.deadline.slice(0, 10) : ""
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task?.estimated_minutes?.toString() ?? ""
  );
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [difficulty, setDifficulty] = useState(task?.difficulty ?? "medium");
  const [nextAction, setNextAction] = useState(task?.next_action ?? "");
  const [recoveryAction, setRecoveryAction] = useState(
    task?.recovery_action ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      deadline: deadline ? new Date(`${deadline}T23:59:59+09:00`).toISOString() : null,
      estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      priority,
      difficulty,
      next_action: nextAction.trim() || null,
      recovery_action: recoveryAction.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = isEdit
      ? await supabase.from("tasks").update(payload).eq("id", task.id)
      : await supabase.from("tasks").insert({ ...payload, user_id: user.id });

    setSaving(false);
    if (dbError) {
      setError("保存に失敗しました。もう一度お試しください。");
      return;
    }
    router.push("/tasks");
    router.refresh();
  }

  async function handleDelete() {
    if (!isEdit) return;
    if (!confirm("このタスクを削除しますか？")) return;
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id);
    if (dbError) {
      setError("削除に失敗しました");
      return;
    }
    router.push("/tasks");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          タイトル <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="例: 研究レポートの下書き"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          メモ
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClass} min-h-20`}
          placeholder="任意"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            締切
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            見積(分)
          </label>
          <input
            type="number"
            min={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            className={inputClass}
            placeholder="30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            優先度
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
            className={inputClass}
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            重さ
          </label>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as Task["difficulty"])
            }
            className={inputClass}
          >
            <option value="low">かるい</option>
            <option value="medium">ふつう</option>
            <option value="high">おもい</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          次の一歩
        </label>
        <input
          type="text"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          className={inputClass}
          placeholder="例: 資料フォルダを開いて目次だけ書く"
        />
        <p className="mt-1 text-xs text-gray-400">
          迷わず始められる、具体的な最初の行動
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          復帰用の最小行動
        </label>
        <input
          type="text"
          value={recoveryAction}
          onChange={(e) => setRecoveryAction(e.target.value)}
          className={inputClass}
          placeholder="例: 5分だけ資料を眺める"
        />
        <p className="mt-1 text-xs text-gray-400">
          調子が出ない日でもできる、5〜15分の小さな行動
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
      >
        {saving ? "保存中..." : isEdit ? "保存する" : "タスクを作成"}
      </button>

      {isEdit && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-2xl py-3 text-sm text-red-500"
        >
          このタスクを削除
        </button>
      )}
    </form>
  );
}
