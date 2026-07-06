"use client";

import { useState } from "react";

/**
 * Copies the given text to the clipboard, with a collapsible preview.
 */
export default function CopyText({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard未対応環境はプレビューから手動コピーしてもらう
      setShowPreview(true);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 rounded-2xl border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 active:bg-gray-50"
        >
          {copied ? "✅ コピーしました" : label}
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-500 active:bg-gray-50"
          aria-label="プレビュー"
        >
          {showPreview ? "▲" : "▼"}
        </button>
      </div>
      {showPreview && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
          {text}
        </pre>
      )}
    </div>
  );
}
