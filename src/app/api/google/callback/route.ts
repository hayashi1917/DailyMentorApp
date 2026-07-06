import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, getAppUrl, saveConnection } from "@/lib/google";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const settingsUrl = `${getAppUrl()}/settings`;

  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${settingsUrl}?calendar=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${getAppUrl()}/login`);
  }

  try {
    const tokens = await exchangeCode(code);
    await saveConnection(supabase, user.id, tokens);
  } catch (e) {
    console.error("google callback failed:", e);
    return NextResponse.redirect(`${settingsUrl}?calendar=error`);
  }

  return NextResponse.redirect(`${settingsUrl}?calendar=connected`);
}
