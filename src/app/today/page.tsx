import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, getTodayDate } from "@/lib/date";
import { judgeRecoveryMode } from "@/lib/recovery";
import { MOOD_LABELS, PLAN_TYPE_LABELS } from "@/lib/labels";
import type { DailyCheckin, DailyPlanRow, PlanItem } from "@/lib/types";
import AppShell from "@/components/AppShell";
import GeneratePlanButton from "@/components/GeneratePlanButton";
import FeedbackButtons from "@/components/FeedbackButtons";

export const dynamic = "force-dynamic";

function PlanList({
  items,
  highlight = false,
}: {
  items: PlanItem[];
  highlight?: boolean;
}) {
  if (!items.length) {
    return <p className="text-sm text-gray-400">なし</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className={`rounded-xl px-4 py-3 ${
            highlight ? "bg-white shadow-sm" : "bg-gray-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p
              className={
                highlight ? "font-semibold text-gray-900" : "text-sm text-gray-800"
              }
            >
              {item.title}
            </p>
            {item.estimated_minutes != null && (
              <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                {item.estimated_minutes}分
              </span>
            )}
          </div>
          {item.reason && (
            <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const today = getTodayDate(profile?.timezone ?? undefined);

  const [checkinRes, planRes, recovery] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    judgeRecoveryMode(supabase, user.id, today),
  ]);

  const checkin = checkinRes.data as DailyCheckin | null;
  const plan = planRes.data as DailyPlanRow | null;
  const isRecovery = plan?.is_recovery_mode ?? recovery.isRecoveryMode;

  return (
    <AppShell calm={isRecovery}>
      {/* ヘッダー */}
      <div className="pt-4">
        <p className="text-sm text-gray-500">{formatDateJa(today)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {isRecovery ? "今日は、復帰する日 🌱" : "今日"}
        </h1>
        {isRecovery && (
          <p className="mt-2 rounded-xl bg-white/70 px-4 py-3 text-sm leading-relaxed text-gray-600">
            うまくいかない日は誰にでもあります。今日は取り返す日ではなく、
            小さく戻ってくる日にしましょう。
          </p>
        )}
      </div>

      {/* チェックイン状態 */}
      <section className="mt-5">
        {checkin ? (
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-700">
              ✅ チェックイン済み
              {checkin.mood && ` / ${MOOD_LABELS[checkin.mood]}`}
              {checkin.plan_type && ` / ${PLAN_TYPE_LABELS[checkin.plan_type]}`}
            </p>
            <Link href="/checkin" className="text-xs text-brand-600">
              編集
            </Link>
          </div>
        ) : (
          <Link
            href="/checkin"
            className="block rounded-xl border border-dashed border-brand-500 bg-brand-50 px-4 py-3 text-sm text-brand-700"
          >
            ☀️ まだ朝チェックインをしていません。今日の調子を教えてください →
          </Link>
        )}
      </section>

      {plan ? (
        <>
          {/* 今日の方針 */}
          {plan.policy && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-500">今日の方針</h2>
              <p className="mt-1 leading-relaxed text-gray-800">{plan.policy}</p>
            </section>
          )}

          {/* メンターコメント */}
          {plan.mentor_message && (
            <section className="mt-5 rounded-2xl bg-brand-100 px-4 py-4">
              <p className="text-xs font-semibold text-brand-700">
                💬 メンターから
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-800">
                {plan.mentor_message}
              </p>
              <div className="mt-3">
                <FeedbackButtons
                  targetType="mentor_message"
                  targetId={plan.id}
                  title="このコメントはどうでしたか？"
                  options={[
                    { type: "helpful", label: "ちょうどいい" },
                    { type: "tone_too_strict", label: "厳しすぎる" },
                    { type: "tone_too_soft", label: "優しすぎる" },
                    { type: "too_long", label: "長すぎる" },
                    {
                      type: "other",
                      label: "もっと具体的に",
                      text: "もっと具体的にしてほしい",
                    },
                  ]}
                />
              </div>
            </section>
          )}

          {/* 最低ライン(最重要) */}
          <section className="mt-6 rounded-2xl border-2 border-brand-500 bg-brand-50 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-brand-700">
                🎯 最低ライン
              </h2>
              <span className="text-xs text-brand-600">
                ここまでできれば今日はOK
              </span>
            </div>
            <div className="mt-3">
              <PlanList items={plan.minimum_plan_json ?? []} highlight />
            </div>
          </section>

          {/* 標準ライン */}
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-gray-500">📗 標準ライン</h2>
            <div className="mt-2">
              <PlanList items={plan.standard_plan_json ?? []} />
            </div>
          </section>

          {/* 余裕ライン */}
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-gray-500">
              🚀 余裕ライン(余力があれば)
            </h2>
            <div className="mt-2">
              <PlanList items={plan.stretch_plan_json ?? []} />
            </div>
          </section>

          {/* If-Then プラン */}
          {(plan.if_then_plan_json ?? []).length > 0 && (
            <section className="mt-5">
              <h2 className="text-sm font-semibold text-gray-500">
                🔀 もしもの時は
              </h2>
              <ul className="mt-2 space-y-2">
                {(plan.if_then_plan_json ?? []).map((p, i) => (
                  <li key={i} className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
                    <span className="text-gray-500">もし</span>{" "}
                    <span className="text-gray-800">{p.if}</span>
                    <span className="text-gray-500"> なら → </span>
                    <span className="font-medium text-gray-900">{p.then}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 計画へのフィードバック */}
          <section className="mt-6 rounded-2xl bg-gray-50 p-4">
            <FeedbackButtons
              targetType={isRecovery ? "recovery_plan" : "daily_plan"}
              targetId={plan.id}
              title={
                isRecovery
                  ? "今日の復帰プランはどうでしたか？"
                  : "今日の計画はどうでしたか？"
              }
              options={
                isRecovery
                  ? [
                      { type: "helpful", label: "復帰しやすかった" },
                      { type: "too_heavy", label: "まだ重かった" },
                      {
                        type: "helpful",
                        label: "励ましがよかった",
                        text: "励ましがよかった",
                      },
                      {
                        type: "not_helpful",
                        label: "実行する気にならなかった",
                      },
                    ]
                  : [
                      { type: "helpful", label: "よかった" },
                      { type: "too_heavy", label: "重すぎる" },
                      { type: "too_light", label: "軽すぎる" },
                      { type: "wrong_priority", label: "優先順位が違う" },
                      { type: "bad_timing", label: "時間帯が合わない" },
                    ]
              }
            />
          </section>
        </>
      ) : (
        <section className="mt-8 rounded-2xl bg-gray-50 px-5 py-8 text-center">
          <p className="text-3xl">🗺</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            まだ今日の計画がありません。
            <br />
            チェックインしてから生成すると、より合った計画になります。
          </p>
        </section>
      )}

      {/* CTA */}
      <div className="mt-6 space-y-3">
        <GeneratePlanButton hasPlan={!!plan} />
        <Link
          href="/review"
          className="block w-full rounded-2xl border border-gray-300 bg-white py-3.5 text-center text-sm font-medium text-gray-700 active:bg-gray-50"
        >
          🌙 夜レビューへ
        </Link>
      </div>
    </AppShell>
  );
}
