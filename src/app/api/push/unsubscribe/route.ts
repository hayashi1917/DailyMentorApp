import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
