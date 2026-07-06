import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndSaveDailyPlan } from "@/lib/plan";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const result = await generateAndSaveDailyPlan(supabase, user.id, {
    timezone: profile?.timezone ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    plan: result.plan,
    recovery: result.recovery,
  });
}
