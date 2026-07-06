import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;

export function isPushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

function getWebPush() {
  if (!isPushConfigured()) {
    throw new Error("VAPID keys are not set");
  }
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return webpush;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Sends a push notification to all of the user's subscriptions.
 * Stale subscriptions (404/410) are deleted. Returns delivered count.
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<number> {
  const wp = getWebPush();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  let delivered = 0;
  for (const sub of subs ?? []) {
    try {
      await wp.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      delivered++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("push send failed:", e);
      }
    }
  }
  return delivered;
}
