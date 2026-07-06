"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) {
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, [vapidKey]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("通知が許可されませんでした。ブラウザの設定を確認してください。");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setEnabled(true);
      setMessage("通知をオンにしました");
    } catch {
      setMessage("通知の設定に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMessage("通知をオフにしました");
    } catch {
      setMessage("解除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = await res.json();
      setMessage(res.ok ? "テスト通知を送信しました" : (json.error ?? "送信に失敗しました"));
    } catch {
      setMessage("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-gray-400">
        このブラウザはWebプッシュ通知に対応していないか、VAPIDキーが未設定です。
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-800">
          {enabled ? "🔔 通知: オン" : "🔕 通知: オフ"}
        </p>
        <button
          onClick={enabled ? disable : enable}
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
            enabled
              ? "border border-gray-300 text-gray-600"
              : "bg-brand-600 text-white"
          }`}
        >
          {busy ? "..." : enabled ? "オフにする" : "オンにする"}
        </button>
      </div>
      {enabled && (
        <button
          onClick={sendTest}
          disabled={busy}
          className="mt-2 text-xs text-brand-600 disabled:opacity-50"
        >
          テスト通知を送る →
        </button>
      )}
      {message && <p className="mt-2 text-xs text-brand-600">{message}</p>}
    </div>
  );
}
