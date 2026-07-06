import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
].join(" ");

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function getRedirectUri(): string {
  return `${getAppUrl()}/api/google/callback`;
}

export function isGoogleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY
  );
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Decode the email claim from an id_token without verification (display only). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function saveConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: TokenResponse
) {
  const row: Record<string, unknown> = {
    user_id: userId,
    google_email: emailFromIdToken(tokens.id_token),
    access_token_enc: encryptToken(tokens.access_token),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // refresh_token is only returned on first consent; keep the old one otherwise
  if (tokens.refresh_token) {
    row.refresh_token_enc = encryptToken(tokens.refresh_token);
  }
  const { error } = await supabase
    .from("google_calendar_connections")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Returns a valid access token for the user, refreshing it if expired.
 * Returns null when the user has no Google connection.
 */
export async function getAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: conn } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn?.access_token_enc) return null;

  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    return decryptToken(conn.access_token_enc);
  }

  if (!conn.refresh_token_enc) return null;

  const refreshed = await refreshAccessToken(
    decryptToken(conn.refresh_token_enc)
  );
  await supabase
    .from("google_calendar_connections")
    .update({
      access_token_enc: encryptToken(refreshed.access_token),
      expires_at: new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

// ------------------------------------------------------------
// Calendar API
// ------------------------------------------------------------
export type CalendarEvent = {
  id: string;
  summary: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
};

export async function listEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`calendar list failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  type GoogleEvent = {
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    transparency?: string;
  };
  return ((json.items ?? []) as GoogleEvent[])
    .filter((e) => e.transparency !== "transparent")
    .map((e) => ({
      id: e.id,
      summary: e.summary ?? "(無題の予定)",
      start: e.start?.dateTime ?? `${e.start?.date}T00:00:00+09:00`,
      end: e.end?.dateTime ?? `${e.end?.date}T00:00:00+09:00`,
      allDay: !e.start?.dateTime,
    }));
}

export async function insertEvent(
  accessToken: string,
  event: { summary: string; description?: string; start: string; end: string }
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
    }),
  });
  if (!res.ok) {
    throw new Error(`calendar insert failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ------------------------------------------------------------
// Free slot detection
// ------------------------------------------------------------
export type FreeSlot = { start: string; end: string; minutes: number };

/**
 * Computes free slots for the given day (JST) within waking hours,
 * skipping all-day events and clamping the window start to "now".
 */
export function computeFreeSlots(
  events: CalendarEvent[],
  date: string,
  options: { dayStartHour?: number; dayEndHour?: number; minMinutes?: number } = {}
): FreeSlot[] {
  const { dayStartHour = 7, dayEndHour = 23, minMinutes = 15 } = options;

  const windowStart = new Date(
    `${date}T${String(dayStartHour).padStart(2, "0")}:00:00+09:00`
  ).getTime();
  const windowEnd = new Date(
    `${date}T${String(dayEndHour).padStart(2, "0")}:00:00+09:00`
  ).getTime();

  let cursor = Math.max(windowStart, Date.now());

  const busy = events
    .filter((e) => !e.allDay)
    .map((e) => ({
      start: new Date(e.start).getTime(),
      end: new Date(e.end).getTime(),
    }))
    .filter((e) => e.end > cursor && e.start < windowEnd)
    .sort((a, b) => a.start - b.start);

  const slots: FreeSlot[] = [];
  for (const b of busy) {
    if (b.start - cursor >= minMinutes * 60_000) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(b.start).toISOString(),
        minutes: Math.floor((b.start - cursor) / 60_000),
      });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (windowEnd - cursor >= minMinutes * 60_000) {
    slots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(windowEnd).toISOString(),
      minutes: Math.floor((windowEnd - cursor) / 60_000),
    });
  }
  return slots;
}
