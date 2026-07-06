"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError("ログインに失敗しました。メールアドレスとパスワードを確認してください。");
          return;
        }
        router.push("/today");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) {
          setError(`登録に失敗しました: ${error.message}`);
          return;
        }
        if (data.session) {
          router.push("/today");
          router.refresh();
        } else {
          setNotice(
            "確認メールを送信しました。メール内のリンクを開いてからログインしてください。"
          );
          setMode("signin");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">
        {mode === "signin" ? "おかえりなさい" : "はじめまして"}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {mode === "signin"
          ? "今日も小さく積み上げましょう"
          : "アカウントを作成します"}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            メールアドレス
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            パスワード
          </label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
            placeholder="6文字以上"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-brand-600">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {loading
            ? "送信中..."
            : mode === "signin"
              ? "ログイン"
              : "アカウント作成"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="mt-6 text-center text-sm text-brand-600"
      >
        {mode === "signin"
          ? "アカウントを作成する →"
          : "すでにアカウントをお持ちの方 →"}
      </button>
    </div>
  );
}
