import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPushConfigured, sendPushToUser } from "@/lib/push";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "VAPIDキーが未設定です" },
      { status: 501 }
    );
  }

  const delivered = await sendPushToUser(supabase, user.id, {
    title: "Daily Mentor Agent 🌱",
    body: "通知の設定ができました。小さく積み上げていきましょう。",
    url: "/today",
  });

  if (delivered === 0) {
    return NextResponse.json(
      { error: "有効な購読がありません。通知をオンにし直してください。" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, delivered });
}
