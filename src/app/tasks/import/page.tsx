"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ParsedTask } from "@/lib/schemas";
import AppShell from "@/components/AppShell";

type EditableTask = ParsedTask & { selected: boolean };

const PLACEHOLDER = `例:
S：ポスター修正(4H), ラクス コーディングテスト(2h), 富士通 ES
A：日立 ES, 日本総研 ES, 株式会社ナガセ：受験校アプリ
B：アクセンチュア ES
金曜までに研究の中間報告も出す`;

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500";

export default function ImportTasksPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [proposals, setProposals] = useState<EditableTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "解析に失敗しました");
        return;
      }
      setProposals(
        (json.tasks as ParsedTask[]).map((t) => ({ ...t, selected: true }))
      );
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function update(i: number, patch: Partial<EditableTask>) {
    setProposals((prev) =>
      prev ? prev.map((t, j) => (j === i ? { ...t, ...patch } : t)) : prev
    );
  }

  async function save() {
    if (!proposals) return;
    const selected = proposals.filter((t) => t.selected && t.title.trim());
    if (selected.length === 0) return;

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

    const rows = selected.map((t) => ({
      user_id: user.id,
      title: t.title.trim(),
      description: t.description ?? null,
      estimated_minutes: t.estimated_minutes ?? null,
      priority: t.priority,
      difficulty: t.difficulty,
      deadline: t.deadline
        ? new Date(`${t.deadline}T23:59:59+09:00`).toISOString()
        : null,
    }));

    const { error: dbError } = await supabase.from("tasks").insert(rows);
    setSaving(false);
    if (dbError) {
      setError("保存に失敗しました");
      return;
    }
    router.push("/tasks");
    router.refresh();
  }

  return (
    <AppShell title="📄 文書からタスクを取り込む">
      <p className="text-xs leading-relaxed text-gray-500">
        メモやランク表(S/A/B)など、粒度の粗いテキストを貼り付けてください。
        AIが実行可能なタスクに分解します。<b>保存するまでDBには書き込まれません。</b>
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        className="mt-4 min-h-40 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-brand-500"
      />

      <button
        onClick={parse}
        disabled={loading || !text.trim()}
        className="mt-3 w-full rounded-2xl bg-brand-600 py-3.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "AIが分解しています..." : "タスクに分解する"}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {proposals && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-gray-700">
            分解結果 ({proposals.filter((t) => t.selected).length}/
            {proposals.length}件を保存)
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            内容を編集し、不要なものはチェックを外してから保存してください。
          </p>

          <ul className="mt-3 space-y-3">
            {proposals.map((t, i) => (
              <li
                key={i}
                className={`rounded-xl border p-3 ${
                  t.selected
                    ? "border-brand-100 bg-white"
                    : "border-gray-100 bg-gray-50 opacity-60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={t.selected}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                    className="mt-2.5 h-4 w-4 accent-brand-600"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      value={t.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      className={inputClass}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={t.priority}
                        onChange={(e) =>
                          update(i, {
                            priority: e.target
                              .value as EditableTask["priority"],
                          })
                        }
                        className={inputClass}
                      >
                        <option value="high">優先: 高(S)</option>
                        <option value="medium">優先: 中(A)</option>
                        <option value="low">優先: 低(B)</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={t.estimated_minutes ?? ""}
                        placeholder="分"
                        onChange={(e) =>
                          update(i, {
                            estimated_minutes: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        className={inputClass}
                      />
                      <input
                        type="date"
                        value={t.deadline ?? ""}
                        onChange={(e) =>
                          update(i, { deadline: e.target.value || undefined })
                        }
                        className={inputClass}
                      />
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-400">{t.description}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={save}
            disabled={saving || proposals.every((t) => !t.selected)}
            className="mt-4 w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
          >
            {saving
              ? "保存中..."
              : `${proposals.filter((t) => t.selected).length}件のタスクを保存`}
          </button>
        </div>
      )}
    </AppShell>
  );
}
