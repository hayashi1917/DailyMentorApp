"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import type { MentorAction } from "@/lib/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  actions?: MentorAction[] | null;
};

const WELCOME: Message = {
  role: "assistant",
  content:
    "こんにちは 🌱 ここで話しながら、タスクの登録や今日の計画づくりまで一緒にできます。「今日の計画を立てて」「◯◯を金曜までにやりたい」など、なんでもどうぞ。",
};

const SUGGESTIONS = [
  "今日の計画を一緒に立てて",
  "やりたいことがあるからタスクにして",
  "今日の計画をもう少し軽くして",
  "やる気が出ない",
];

function ActionChips({ actions }: { actions: MentorAction[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {actions.map((a, i) => {
        if (a.type === "tasks_created") {
          return (
            <Link
              key={i}
              href="/tasks"
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
            >
              ✅ タスクを{a.titles.length}件登録 →
            </Link>
          );
        }
        if (a.type === "task_updated") {
          return (
            <span
              key={i}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
            >
              ✏️ 「{a.title}」を更新
            </span>
          );
        }
        if (a.type === "plan_updated") {
          return (
            <Link
              key={i}
              href="/today"
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
            >
              📅 今日の計画を更新 →
            </Link>
          );
        }
        return (
          <Link
            key={i}
            href="/settings/memory"
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700"
          >
            🧠 覚えました: {a.content.length > 24 ? `${a.content.slice(0, 24)}…` : a.content}
          </Link>
        );
      })}
    </div>
  );
}

export default function MentorPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 過去の会話をDBから復元する(端末をまたいでも続きから話せる)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mentor/chat");
        const json = await res.json();
        if (!cancelled && res.ok && json.messages?.length) {
          setMessages([
            WELCOME,
            ...json.messages.map(
              (m: {
                role: "user" | "assistant";
                content: string;
                actions_json: MentorAction[] | null;
              }) => ({
                role: m.role,
                content: m.content,
                actions: m.actions_json,
              })
            ),
          ]);
        }
      } catch {
        // 履歴が取れなくても新規会話は始められる
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/mentor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.error ?? "うまく返答できませんでした。もう一度送ってみてください。",
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply, actions: json.actions },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "通信に失敗しました。少し時間をおいて試してください。",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell title="💬 メンター">
      <div className="space-y-3 pb-32">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div className="max-w-[85%]">
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-brand-600 text-white"
                    : "rounded-bl-md bg-gray-100 text-gray-800"
                }`}
              >
                {m.content}
              </div>
              {m.actions?.length ? <ActionChips actions={m.actions} /> : null}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 text-sm text-gray-400">
              考えています...
            </div>
          </div>
        )}
        {loaded && messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 active:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="fixed inset-x-0 bottom-16 z-10 border-t border-gray-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-md gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="計画の相談・タスク追加・雑談なんでも..."
            className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2.5 text-base outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-40"
          >
            送信
          </button>
        </div>
      </form>
    </AppShell>
  );
}
