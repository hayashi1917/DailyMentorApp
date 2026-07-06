"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "今なにから始めればいい？",
  "やる気が出ない",
  "今日の計画が重く感じる",
];

export default function MentorPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "こんにちは 🌱 今日の様子はどうですか？迷っていること、しんどいこと、なんでもどうぞ。",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/mentor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-11, -1),
        }),
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
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
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
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-brand-600 text-white"
                  : "rounded-bl-md bg-gray-100 text-gray-800"
              }`}
            >
              {m.content}
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
        {messages.length <= 1 && (
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
            placeholder="メッセージを入力..."
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
