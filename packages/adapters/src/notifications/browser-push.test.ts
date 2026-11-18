import type { AdapterContext, NotificationMessage } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import type { BrowserPushStore, BrowserPushSubscription } from "./browser-push.js";
import { BrowserPushSender, browserPushKeys, browserPushPayload } from "./browser-push.js";

const subscription = (endpoint: string): BrowserPushSubscription => ({
  endpoint,
  keys: { p256dh: "p256dh", auth: "auth" },
});

const message: NotificationMessage = {
  kind: "help",
  title: "Inbox needs approval",
  body: "Review before send_email",
  botId: "bot-1",
  threadId: "thread-1",
  runId: "run-1",
};

const context = {
  operationId: "op",
  traceId: "trace",
  spaceId: "space-1",
  userId: "user-1",
  signal: new AbortController().signal,
} satisfies AdapterContext;

function fakeStore(rows: Array<{ id: string; sessionId: string; endpoint: string }>) {
  return {
    list: vi.fn(async () =>
      rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        subscription: subscription(row.endpoint),
      })),
    ),
    removeById: vi.fn(async () => undefined),
  } as unknown as BrowserPushStore & { removeById: ReturnType<typeof vi.fn> };
}

describe("BrowserPushSender", () => {
  const live = async () => new Date(Date.now() + 60_000);

  it("delivers the run, space and chat so the service worker can answer", async () => {
    const transport = vi.fn(
      async (_sub: BrowserPushSubscription, _payload: string, _ttl: number) => 201,
    );
    const sender = new BrowserPushSender(
      fakeStore([{ id: "a", sessionId: "s", endpoint: "https://push.example.test/a" }]),
      transport,
      live,
    );
    await expect(sender.deliver(message, context)).resolves.toBe("delivered");
    const [, payload] = transport.mock.calls[0]!;
    expect(JSON.parse(payload)).toEqual(browserPushPayload(message, "space-1"));
    expect(JSON.parse(payload)).toMatchObject({ runId: "run-1", spaceId: "space-1", kind: "help" });
  });

  it("drops a browser the push service says is gone", async () => {
    const store = fakeStore([{ id: "a", sessionId: "s", endpoint: "https://push.example.test/a" }]);
    const sender = new BrowserPushSender(
      store,
      vi.fn(async () => 410),
      live,
    );
    await expect(sender.deliver(message, context)).resolves.toBe("undeliverable");
    expect(store.removeById).toHaveBeenCalledWith("user-1", "a");
  });

  it("skips and drops browsers whose session ended", async () => {
    const store = fakeStore([
      { id: "a", sessionId: "gone", endpoint: "https://push.example.test/a" },
    ]);
    const transport = vi.fn(
      async (_sub: BrowserPushSubscription, _payload: string, _ttl: number) => 201,
    );
    const sender = new BrowserPushSender(store, transport, async () => null);
    await expect(sender.hasRecipient("user-1")).resolves.toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(store.removeById).toHaveBeenCalledWith("user-1", "a");
  });

  it("is delivered when one of several browsers takes it", async () => {
    const store = fakeStore([
      { id: "a", sessionId: "s", endpoint: "https://push.example.test/a" },
      { id: "b", sessionId: "s", endpoint: "https://push.example.test/b" },
    ]);
    const transport = vi.fn(async (sub: BrowserPushSubscription) =>
      sub.endpoint.endsWith("a") ? 500 : 201,
    );
    const sender = new BrowserPushSender(store, transport, live);
    await expect(sender.deliver(message, context)).resolves.toBe("delivered");
  });
});

describe("browserPushKeys", () => {
  it("needs all three settings", () => {
    expect(
      browserPushKeys({ WEB_PUSH_PUBLIC_KEY: "pub", WEB_PUSH_PRIVATE_KEY: "priv" }),
    ).toBeUndefined();
    expect(
      browserPushKeys({
        WEB_PUSH_PUBLIC_KEY: " pub ",
        WEB_PUSH_PRIVATE_KEY: "priv",
        WEB_PUSH_CONTACT: "mailto:ops@example.test",
      }),
    ).toEqual({ publicKey: "pub", privateKey: "priv", contact: "mailto:ops@example.test" });
  });
});
