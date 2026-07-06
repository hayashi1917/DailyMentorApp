"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // 開発中はSWを使わない。開発サーバーのチャンクはURLが同じまま中身が変わるため、
    // キャッシュ優先のSWが古いJSを配信して "reading 'call'" エラーの原因になる。
    // 過去に登録されたSWとキャッシュも掃除する。
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            keys.filter((k) => k.startsWith("dma-")).forEach((k) => caches.delete(k))
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .catch((e) => console.error("SW registration failed:", e));
  }, []);

  return null;
}
