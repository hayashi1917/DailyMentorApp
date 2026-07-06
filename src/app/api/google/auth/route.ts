import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, getAppUrl, isGoogleConfigured } from "@/lib/google";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${getAppUrl()}/login`);
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google連携が未設定です。GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / TOKEN_ENCRYPTION_KEY を設定してください。",
      },
      { status: 501 }
    );
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
