import type { RpcClient } from "../query/rpc";

type PushHost = {
  navigator: { serviceWorker?: Pick<ServiceWorkerContainer, "getRegistration"> };
  Notification?: { readonly permission: NotificationPermission };
};

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Once notifications are allowed, ties this browser's push subscription to the session, so
 * approvals and replies reach the installed app while it is closed. Nothing happens when the
 * server has no push key or the browser has no service worker.
 */
export async function syncBrowserPush(
  client: Pick<RpcClient, "notifications">,
  host: PushHost = { navigator, Notification: globalThis.Notification },
): Promise<boolean> {
  if (host.Notification?.permission !== "granted") return false;
  const registration = await host.navigator.serviceWorker?.getRegistration();
  if (!registration?.pushManager) return false;
  const { publicKey } = await client.notifications.browserPushKey();
  if (!publicKey) return false;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await client.notifications.registerBrowserPush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return true;
}
