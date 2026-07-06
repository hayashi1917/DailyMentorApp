import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAccessToken, insertEvent } from "@/lib/google";

const blockInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    description: z.string().max(1000).optional(),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), {
    message: "end must be after start",
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

  const parsed = blockInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(supabase, user.id);
  } catch (e) {
    console.error("getAccessToken failed:", e);
  }
  if (!accessToken) {
    return NextResponse.json(
      { error: "Googleカレンダーが連携されていません" },
      { status: 409 }
    );
  }

  try {
    const event = await insertEvent(accessToken, {
      summary: `🌱 ${parsed.data.title}`,
      description:
        parsed.data.description ?? "Daily Mentor Agent の作業ブロック",
      start: parsed.data.start,
      end: parsed.data.end,
    });
    return NextResponse.json({ ok: true, eventId: event.id, link: event.htmlLink });
  } catch (e) {
    console.error("calendar block failed:", e);
    return NextResponse.json(
      { error: "カレンダーへの登録に失敗しました" },
      { status: 502 }
    );
  }
}
