export type PushNotice = {
  kind: "completion" | "failure" | "help" | "takeover";
  title: string;
  body: string;
  spaceId: string;
  botId: string;
  threadId: string;
  groupId?: string;
  runId?: string;
};

type ExtendableEvent = { waitUntil(promise: Promise<unknown>): void };
type PushEvent = ExtendableEvent & { data: { json(): unknown } | null };
type NotificationClickEvent = ExtendableEvent & {
  action: string;
  notification: { data: unknown; close(): void };
};
type WindowClient = {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
};

export type PushScope = {
  location: { origin: string };
  registration: {
    showNotification(
      title: string,
      options: {
        body: string;
        tag: string;
        data: PushNotice;
        icon?: string;
        badge?: string;
        actions?: Array<{ action: string; title: string }>;
        requireInteraction?: boolean;
      },
    ): Promise<void>;
  };
  clients: {
    matchAll(options: {
      type: "window";
      includeUncontrolled: boolean;
    }): Promise<readonly WindowClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  fetch(input: string, init: RequestInit): Promise<Response>;
  addEventListener(type: "push", listener: (event: PushEvent) => void): void;
  addEventListener(
    type: "notificationclick",
    listener: (event: NotificationClickEvent) => void,
  ): void;
};

export const APPROVE_ACTION = "allow";
export const DENY_ACTION = "deny";

function readNotice(value: unknown): PushNotice | null {
  if (!value || typeof value !== "object") return null;
  const notice = value as Partial<PushNotice>;
  if (typeof notice.title !== "string" || typeof notice.botId !== "string") return null;
  return notice as PushNotice;
}

/** Where a tap opens: the chat, so an approval card is the first thing on screen. */
export function noticePath(notice: PushNotice): string {
  return notice.groupId
    ? `/app/g/${encodeURIComponent(notice.groupId)}`
    : `/app/${encodeURIComponent(notice.botId)}`;
}

/**
 * Shows pushes from the server and answers an approval from its buttons. Browsers without
 * notification buttons (iPhone) open the chat on a tap instead.
 */
export function installPushHandlers(scope: PushScope): void {
  scope.addEventListener("push", (event) => {
    const notice = readNotice(event.data?.json());
    if (!notice) return;
    const approval = notice.kind === "help" && notice.runId;
    event.waitUntil(
      scope.registration.showNotification(notice.title, {
        body: notice.body,
        tag: notice.runId ?? notice.threadId,
        data: notice,
        icon: "/icon-192.png",
        ...(approval
          ? {
              requireInteraction: true,
              actions: [
                { action: APPROVE_ACTION, title: "Approve" },
                { action: DENY_ACTION, title: "Deny" },
              ],
            }
          : {}),
      }),
    );
  });

  scope.addEventListener("notificationclick", (event) => {
    const notice = readNotice(event.notification.data);
    event.notification.close();
    if (!notice) return;
    const answer =
      event.action === APPROVE_ACTION || event.action === DENY_ACTION ? event.action : null;
    event.waitUntil(answer && notice.runId ? answerApproval(notice, answer) : openChat(notice));
  });

  async function answerApproval(notice: PushNotice, answer: string): Promise<void> {
    let answered = false;
    try {
      const response = await scope.fetch(`${scope.location.origin}/rpc/threads/answerApproval`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-rakazo-space-id": notice.spaceId },
        body: JSON.stringify({ json: { runId: notice.runId, answer } }),
      });
      answered = response.ok;
    } catch (error) {
      // Offline: the card in the chat still waits for an answer.
      console.warn("Could not answer the approval", error);
    }
    // Signed out, already answered, or offline: the card in the chat says what happened.
    if (!answered) await openChat(notice);
  }

  async function openChat(notice: PushNotice): Promise<void> {
    const url = `${scope.location.origin}${noticePath(notice)}`;
    const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(scope.location.origin));
    if (open) {
      await open.navigate(url);
      await open.focus();
      return;
    }
    await scope.clients.openWindow(url);
  }
}
