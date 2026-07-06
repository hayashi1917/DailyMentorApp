"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentSkill, LifestylePattern, UserMemory } from "@/lib/types";
import {
  MEMORY_TYPE_LABELS,
  PATTERN_KEY_LABELS,
  SKILL_NAME_LABELS,
} from "@/lib/labels";
import AppShell from "@/components/AppShell";

export default function MemoryPage() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [patterns, setPatterns] = useState<LifestylePattern[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [memRes, patRes, skillRes] = await Promise.all([
      supabase
        .from("user_memories")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("lifestyle_patterns")
        .select("*")
        .order("pattern_key", { ascending: true }),
      supabase
        .from("agent_skills")
        .select("*")
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);
    setMemories((memRes.data ?? []) as UserMemory[]);
    setPatterns((patRes.data ?? []) as LifestylePattern[]);
    setSkills((skillRes.data ?? []) as AgentSkill[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteMemory(id: string) {
    if (!confirm("この記憶を削除しますか？")) return;
    const supabase = createClient();
    await supabase.from("user_memories").delete().eq("id", id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function toggleSkill(skill: AgentSkill) {
    const supabase = createClient();
    const next = !skill.is_active;
    await supabase
      .from("agent_skills")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", skill.id);
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, is_active: next } : s))
    );
  }

  async function deleteAll() {
    if (
      !confirm(
        "学習データ(記憶・生活パターン・Skill)をすべて削除します。この操作は取り消せません。よろしいですか？"
      )
    )
      return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await Promise.all([
      supabase.from("user_memories").delete().eq("user_id", user.id),
      supabase.from("lifestyle_patterns").delete().eq("user_id", user.id),
      supabase.from("agent_skills").delete().eq("user_id", user.id),
    ]);
    setMessage("学習データをすべて削除しました");
    load();
  }

  const activeSkills = skills.filter((s) => s.is_active);
  const inactiveSkills = skills.filter((s) => !s.is_active);

  return (
    <AppShell title="🧠 学習された内容">
      <p className="text-xs leading-relaxed text-gray-500">
        AIメンターがあなたについて学習した内容です。間違っているものは削除・無効化できます。
        削除した内容は今後の計画に使われません。
      </p>

      {loading ? (
        <p className="mt-8 text-center text-sm text-gray-400">読み込み中...</p>
      ) : (
        <div className="mt-6 space-y-8">
          {/* user_memories */}
          <section>
            <h2 className="text-sm font-bold text-gray-700">
              📝 あなたについての記憶 ({memories.length})
            </h2>
            {memories.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">
                まだ記憶はありません。使うほど増えていきます。
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {memories.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                          {MEMORY_TYPE_LABELS[m.memory_type] ?? m.memory_type}
                        </span>
                        <p className="mt-1.5 text-sm text-gray-800">{m.content}</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          確度 {Math.round(Number(m.confidence) * 100)}% ・ 観測{" "}
                          {m.evidence_count}回
                        </p>
                      </div>
                      <button
                        onClick={() => deleteMemory(m.id)}
                        className="shrink-0 text-xs text-red-400"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* lifestyle_patterns */}
          <section>
            <h2 className="text-sm font-bold text-gray-700">
              📊 生活リズムの統計 ({patterns.length})
            </h2>
            {patterns.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">
                まだ統計がありません。夜レビューを続けると貯まります。
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {patterns.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="text-xs text-gray-600">
                      {PATTERN_KEY_LABELS[p.pattern_key] ?? p.pattern_key}
                    </span>
                    <span className="text-xs font-semibold text-gray-800">
                      {Math.round(Number(p.value) * 100)}%
                      <span className="ml-1 font-normal text-gray-400">
                        (n={p.sample_size})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* active skills */}
          <section>
            <h2 className="text-sm font-bold text-gray-700">
              ⚡ アクティブなSkill ({activeSkills.length})
            </h2>
            {activeSkills.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">
                まだSkillはありません。フィードバックから育っていきます。
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {activeSkills.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-700">
                          {SKILL_NAME_LABELS[s.skill_name] ?? s.skill_name} v
                          {s.version}
                        </span>
                        <p className="mt-1.5 text-sm text-gray-800">
                          {s.rule_text}
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          由来: {s.created_from}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleSkill(s)}
                        className="shrink-0 text-xs text-gray-400"
                      >
                        無効化
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* inactive skills */}
          {inactiveSkills.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-400">
                💤 無効化されたSkill ({inactiveSkills.length})
              </h2>
              <ul className="mt-2 space-y-2">
                {inactiveSkills.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 opacity-70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
                          {SKILL_NAME_LABELS[s.skill_name] ?? s.skill_name} v
                          {s.version}
                        </span>
                        <p className="mt-1.5 text-sm text-gray-500">
                          {s.rule_text}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleSkill(s)}
                        className="shrink-0 text-xs text-brand-600"
                      >
                        再有効化
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {message && <p className="text-sm text-brand-600">{message}</p>}

          <button
            onClick={deleteAll}
            className="w-full rounded-2xl border border-red-200 py-3 text-sm text-red-500 active:bg-red-50"
          >
            学習データをすべて削除する
          </button>
        </div>
      )}
    </AppShell>
  );
}
