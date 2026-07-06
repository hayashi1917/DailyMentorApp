"use client";

import { useState } from "react";
import type { FeedbackTargetType, FeedbackType } from "@/lib/types";

type Option = { type: FeedbackType; label: string; text?: string };

export default function FeedbackButtons({
  targetType,
  targetId,
  options,
  title = "この提案はどうでしたか？",
}: {
  targetType: FeedbackTargetType;
  targetId?: string | null;
  options: Option[];
  title?: string;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  async function post(body: Record<string, unknown>): Promise<{
    ok: boolean;
    learned: string[];
  }> {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, learned: [] };
    const json = await res.json();
    return { ok: true, learned: json.learned ?? [] };
  }

  async function send(option: Option) {
    if (sending || sent) return;
    setSending(true);
    try {
      const result = await post({
        target_type: targetType,
        target_id: targetId ?? null,
        feedback_type: option.type,
        feedback_text: option.text ?? option.label,
      });
      if (result.ok) setSent(option.label);
    } finally {
      setSending(false);
    }
  }

  async function sendFreeText() {
    const message = text.trim();
    if (!message || sending || sent) return;
    setSending(true);
    try {
      const result = await post({
        target_type: targetType,
        target_id: targetId ?? null,
        feedback_type: "other",
        feedback_text: message,
        is_free_text: true,
      });
      if (result.ok) {
        setSent("自由記述");
        setLearned(result.learned);
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div>
        <p className="text-xs text-brand-600">
          フィードバックを受け取りました
          {sent !== "自由記述" && `(「${sent}」)`}。次の提案に活かします 🌱
        </p>
        {learned.length > 0 && (
          <div className="mt-2 rounded-xl bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold text-gray-500">
              🧠 記憶として学習しました(設定 → 学習された内容 から確認・削除できます)
            </p>
            <ul className="mt-1 space-y-0.5">
              {learned.map((l, i) => (
                <li key={i} className="text-xs text-gray-700">
                  ・{l}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={`${o.type}-${o.label}`}
            onClick={() => send(o)}
            disabled={sending}
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 active:bg-gray-100 disabled:opacity-50"
          >
            {o.label}
          </button>
        ))}
        <button
          onClick={() => setShowText(!showText)}
          disabled={sending}
          className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${
            showText
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-dashed border-gray-300 bg-white text-gray-500"
          }`}
        >
          ✍️ 自由に書く
        </button>
      </div>

      {showText && (
        <div className="mt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例: 午前に重いタスクが2つ並ぶと集中が切れる。重いのは1日1つにして、午後は軽い作業にしてほしい"
            className="min-h-20 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand-500"
            maxLength={1000}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">
              内容から記憶を抽出し、次回の計画・メンターに反映します
            </p>
            <button
              onClick={sendFreeText}
              disabled={sending || !text.trim()}
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white active:bg-brand-700 disabled:opacity-40"
            >
              {sending ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
