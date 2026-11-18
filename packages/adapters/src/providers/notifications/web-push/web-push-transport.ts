import type { BrowserPushTransport } from "../../../notifications/browser-push.js";

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** Loads the Web Push library only on servers that configured push keys. */
export async function createWebPushTransport(vapid: VapidKeys): Promise<BrowserPushTransport> {
  const { default: webPush } = await import("web-push");
  return async (subscription, payload, ttlSeconds) => {
    try {
      const sent = await webPush.sendNotification(subscription, payload, {
        TTL: ttlSeconds,
        urgency: "high",
        vapidDetails: vapid,
      });
      return sent.statusCode;
    } catch (error) {
      // The push service's refusal (gone, too large, bad key) is an answer, not a crash.
      if (error instanceof webPush.WebPushError) return error.statusCode;
      throw error;
    }
  };
}
