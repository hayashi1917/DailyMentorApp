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
  const [sending, setSending] = useState(false);

  async function send(option: Option) {
    if (sending || sent) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId ?? null,
          feedback_type: option.type,
          feedback_text: option.text ?? option.label,
        }),
      });
      if (res.ok) {
        setSent(option.label);
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p className="text-xs text-brand-600">
        フィードバックを受け取りました(「{sent}」)。次の提案に活かします 🌱
      </p>
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
      </div>
    </div>
  );
}
