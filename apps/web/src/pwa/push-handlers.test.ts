import { describe, expect, it, vi } from "vitest";
import type { PushNotice, PushScope } from "./push-handlers";
import { installPushHandlers, noticePath } from "./push-handlers";

const approval: PushNotice = {
  kind: "help",
  title: "Inbox needs approval",
  body: "Review before send_email",
  spaceId: "space-1",
  botId: "bot-1",
  threadId: "thread-1",
  runId: "run-1",
};

function fakeScope(fetchStatus = 200) {
  const listeners: Record<string, (event: never) => void> = {};
  const navigate = vi.fn(async () => undefined);
  const scope = {
    location: { origin: "https://app.example.test" },
    registration: {
      showNotification: vi.fn(async (_title: string, _options: object) => undefined),
    },
    clients: {
      matchAll: vi.fn(async () => [
        { url: "https://app.example.test/app", focus: vi.fn(async () => undefined), navigate },
      ]),
      openWindow: vi.fn(async () => undefined),
    },
    fetch: vi.fn(async () => new Response("{}", { status: fetchStatus })),
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners[type] = listener;
    },
  } satisfies PushScope;
  installPushHandlers(scope);
  const fire = async (type: string, event: object) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
    } as never);
    await pending;
  };
  return { scope, fire, navigate };
}

describe("push handlers", () => {
  it("shows an approval with Approve and Deny", async () => {
    const { scope, fire } = fakeScope();
    await fire("push", { data: { json: () => approval } });
    expect(scope.registration.showNotification).toHaveBeenCalledWith(
      "Inbox needs approval",
      expect.objectContaining({
        tag: "run-1",
        requireInteraction: true,
        actions: [
          { action: "allow", title: "Approve" },
          { action: "deny", title: "Deny" },
        ],
      }),
    );
  });

  it("shows a reply without buttons", async () => {
    const { scope, fire } = fakeScope();
    await fire("push", { data: { json: () => ({ ...approval, kind: "completion" }) } });
    const [, options] = scope.registration.showNotification.mock.calls[0]!;
    expect(options).not.toHaveProperty("actions");
  });

  it("answers the approval in the notification's space without opening the app", async () => {
    const { scope, fire, navigate } = fakeScope();
    await fire("notificationclick", {
      action: "allow",
      notification: { data: approval, close: vi.fn() },
    });
    expect(scope.fetch).toHaveBeenCalledWith(
      "https://app.example.test/rpc/threads/answerApproval",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-rakazo-space-id": "space-1" }),
        body: JSON.stringify({ json: { runId: "run-1", answer: "allow" } }),
      }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the chat when the answer is refused", async () => {
    const { fire, navigate } = fakeScope(409);
    await fire("notificationclick", {
      action: "deny",
      notification: { data: approval, close: vi.fn() },
    });
    expect(navigate).toHaveBeenCalledWith("https://app.example.test/app/bot-1");
  });

  it("opens the chat on a plain tap", async () => {
    const { scope, fire, navigate } = fakeScope();
    await fire("notificationclick", {
      action: "",
      notification: { data: approval, close: vi.fn() },
    });
    expect(scope.fetch).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("https://app.example.test/app/bot-1");
  });

  it("opens a group chat on its own route", () => {
    expect(noticePath({ ...approval, groupId: "group 1" })).toBe("/app/g/group%201");
  });
});
