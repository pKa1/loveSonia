import webPush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webPush.setVapidDetails("mailto:admin@example.com", publicKey, privateKey);
    configured = true;
    return true;
  } catch {
    return false;
  }
}

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function sendPushToSubscription(
  subscription: PushSubscriptionRecord,
  payload: any
): Promise<{ ok: boolean; status?: number }> {
  if (!ensureConfigured()) return { ok: false };
  try {
    const res = await webPush.sendNotification(subscription as any, JSON.stringify(payload));
    return { ok: true, status: res.statusCode };
  } catch (err: any) {
    const status = err?.statusCode;
    return { ok: false, status };
  }
}


