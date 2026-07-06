"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

/**
 * Custom PWA install UX:
 * - Chromium: captures beforeinstallprompt and shows an in-app install card
 * - iOS Safari: shows "share > add to home screen" instructions
 * - Hidden when already installed or dismissed (remembered in localStorage)
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    setDismissed(localStorage.getItem("dma-install-dismissed") === "1");

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem("dma-install-dismissed", "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
    dismiss();
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">
          📲 ホーム画面に追加
        </p>
        <button onClick={dismiss} className="text-xs text-gray-400">
          閉じる
        </button>
      </div>
      {deferredPrompt ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            アプリとしてインストールすると、毎朝ワンタップで開けます。
          </p>
          <button
            onClick={install}
            className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
          >
            インストールする
          </button>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          Safariの共有ボタン(□↑)から「ホーム画面に追加」を選ぶと、
          アプリとして使えます。
        </p>
      )}
    </div>
  );
}
