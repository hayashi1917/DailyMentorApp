"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/AppShell";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
    })();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function runLearning() {
    setUpdating(true);
    setMessage(null);
    try {
      const [patternsRes, skillsRes] = await Promise.all([
        fetch("/api/learning/update-patterns", { method: "POST" }),
        fetch("/api/learning/update-skills", { method: "POST" }),
      ]);
      const skillsJson = await skillsRes.json();
      if (patternsRes.ok && skillsRes.ok) {
        const n = skillsJson.updated?.length ?? 0;
        setMessage(
          n > 0
            ? `学習を更新しました(Skill更新: ${n}件)`
            : "学習を更新しました(Skillの変更はありませんでした)"
        );
      } else {
        setMessage("学習の更新に一部失敗しました");
      }
    } catch {
      setMessage("学習の更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <AppShell title="⚙️ 設定">
      <div className="mt-2 space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400">アカウント</p>
            <p className="mt-0.5 text-sm text-gray-800">{email ?? "..."}</p>
          </div>
          <Link
            href="/settings/memory"
            className="flex items-center justify-between px-4 py-3.5 text-sm text-gray-800 active:bg-gray-50"
          >
            <span>🧠 学習された記憶・Skillを見る</span>
            <span className="text-gray-300">›</span>
          </Link>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
          <p className="text-sm font-semibold text-gray-800">学習を今すぐ更新</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            レビューとフィードバックから、生活パターンとメンターSkillを更新します。
            通常はレビュー保存時に自動で更新されます。
          </p>
          <button
            onClick={runLearning}
            disabled={updating}
            className="mt-3 w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600 active:bg-brand-50 disabled:opacity-50"
          >
            {updating ? "更新中..." : "学習を更新する"}
          </button>
          {message && <p className="mt-2 text-xs text-brand-600">{message}</p>}
        </section>

        <button
          onClick={signOut}
          className="w-full rounded-2xl py-3 text-sm text-red-500"
        >
          ログアウト
        </button>
      </div>
    </AppShell>
  );
}
