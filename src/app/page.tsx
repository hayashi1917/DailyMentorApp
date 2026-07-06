import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/today");
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between px-6 py-12">
      <div className="mt-10">
        <p className="text-4xl">🌱</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Daily Mentor Agent
        </h1>
        <p className="mt-4 leading-relaxed text-gray-600">
          3日坊主を防ぐ、責めないAIメンター。
          <br />
          できなかった日は「取り返す日」ではなく
          <br />
          「復帰する日」。
        </p>

        <ul className="mt-8 space-y-3 text-sm text-gray-700">
          <li className="flex gap-2">
            <span>✅</span>
            <span>最低ライン / 標準ライン / 余裕ラインで無理なく計画</span>
          </li>
          <li className="flex gap-2">
            <span>🌊</span>
            <span>崩れた日は Recovery Mode で最小の一歩に圧縮</span>
          </li>
          <li className="flex gap-2">
            <span>🧠</span>
            <span>使うほどあなたの生活リズムを学習</span>
          </li>
        </ul>
      </div>

      <div className="pb-6">
        <Link
          href="/login"
          className="block w-full rounded-2xl bg-brand-600 py-4 text-center text-base font-semibold text-white active:bg-brand-700"
        >
          はじめる
        </Link>
        <p className="mt-3 text-center text-xs text-gray-400">
          メールアドレスだけで始められます
        </p>
      </div>
    </div>
  );
}
