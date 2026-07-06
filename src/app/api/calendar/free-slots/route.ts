import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayDate } from "@/lib/date";
import {
  computeFreeSlots,
  getAccessToken,
  isGoogleConfigured,
  listEvents,
} from "@/lib/google";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json({ connected: false, configured: false });
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(supabase, user.id);
  } catch (e) {
    console.error("getAccessToken failed:", e);
  }
  if (!accessToken) {
    return NextResponse.json({ connected: false, configured: true });
  }

  const today = getTodayDate();
  try {
    const events = await listEvents(
      accessToken,
      `${today}T00:00:00+09:00`,
      `${today}T23:59:59+09:00`
    );
    const slots = computeFreeSlots(events, today);
    return NextResponse.json({
      connected: true,
      configured: true,
      date: today,
      events: events.map((e) => ({
        summary: e.summary,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
      })),
      slots,
    });
  } catch (e) {
    console.error("free-slots failed:", e);
    return NextResponse.json(
      { error: "カレンダーの取得に失敗しました" },
      { status: 502 }
    );
  }
}
