import type { AdapterContext, NotificationMessage } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { runAsSystem } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { credentialDigest } from "../secrets/credential-digest.js";
import { EncryptedSecretStore } from "../secrets/secrets.js";

export type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Sends one encrypted push and answers the push service's HTTP status. */
export type BrowserPushTransport = (
  subscription: BrowserPushSubscription,
  payload: string,
  ttlSeconds: number,
) => Promise<number>;

type StoredSubscription = { id: string; sessionId: string; subscription: BrowserPushSubscription };

const recordId = (id: string) => `browser-push:${id}`;
const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Browser subscriptions, sealed, one per browser, each tied to the session that made it. */
export class BrowserPushStore {
  private readonly encryption: EncryptedSecretStore;

  constructor(
    private readonly prisma: PrismaClient,
    encryptionKey: string,
  ) {
    this.encryption = new EncryptedSecretStore(encryptionKey);
  }

  async save(
    userId: string,
    sessionId: string,
    subscription: BrowserPushSubscription,
  ): Promise<void> {
    const id = credentialDigest(subscription.endpoint);
    const sealed = await this.encryption.put(
      JSON.stringify(subscription),
      {
        operationId: "browser-push.register",
        traceId: "browser-push.register",
        spaceId: "",
        userId,
        signal: new AbortController().signal,
      },
      { recordId: recordId(id) },
    );
    const data = { userId, sessionId, ciphertext: sealed.ciphertext };
    await runAsSystem("register a browser for push", () =>
      this.prisma.browserPushSubscription.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      }),
    );
  }

  async list(userId: string): Promise<StoredSubscription[]> {
    return runAsSystem("load the user's browser push subscriptions", async () => {
      const rows = await this.prisma.browserPushSubscription.findMany({ where: { userId } });
      return Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          sessionId: row.sessionId,
          subscription: JSON.parse(
            await this.encryption.load(row.ciphertext, recordId(row.id)),
          ) as BrowserPushSubscription,
        })),
      );
    });
  }

  async remove(userId: string, endpoint: string): Promise<void> {
    await this.removeById(userId, credentialDigest(endpoint));
  }

  /** Sign-out drops the session's browsers; a replaced session hands them to the next one. */
  async endSession(userId: string, sessionId: string, nextSessionId?: string): Promise<void> {
    await runAsSystem("end a session's browser push subscriptions", () =>
      nextSessionId
        ? this.prisma.browserPushSubscription.updateMany({
            where: { userId, sessionId },
            data: { sessionId: nextSessionId },
          })
        : this.prisma.browserPushSubscription.deleteMany({ where: { userId, sessionId } }),
    );
  }

  async removeById(userId: string, id: string): Promise<void> {
    await runAsSystem("remove a browser push subscription", () =>
      this.prisma.browserPushSubscription.deleteMany({ where: { id, userId } }),
    );
  }
}

/** What the installed web app's service worker reads from a push. */
export function browserPushPayload(message: NotificationMessage, spaceId: string) {
  return {
    kind: message.kind,
    title: message.title,
    body: message.body,
    spaceId,
    botId: message.botId,
    threadId: message.threadId,
    ...(message.groupId ? { groupId: message.groupId } : {}),
    ...(message.runId ? { runId: message.runId } : {}),
    ...(message.badge !== undefined ? { badge: message.badge } : {}),
  };
}

export class BrowserPushSender {
  constructor(
    private readonly store: BrowserPushStore,
    private readonly transport: BrowserPushTransport,
    private readonly sessionExpiresAt?: (sessionId: string) => Promise<Date | null>,
  ) {}

  async hasRecipient(userId: string): Promise<boolean> {
    return (await this.live(userId)).length > 0;
  }

  /** `undeliverable` when no browser accepted it; a gone subscription is dropped. */
  async deliver(
    message: NotificationMessage,
    context: AdapterContext,
  ): Promise<"delivered" | "undeliverable"> {
    const payload = JSON.stringify(browserPushPayload(message, context.spaceId));
    const results = await Promise.allSettled(
      (await this.live(context.userId)).map(async ({ id, subscription }) => {
        const status = await this.transport(subscription, payload, PUSH_TTL_SECONDS);
        if (status === 404 || status === 410) {
          await this.store.removeById(context.userId, id);
          return false;
        }
        if (status >= 200 && status < 300) return true;
        getLogger().warn("browser_push.rejected", { status });
        return false;
      }),
    );
    for (const result of results)
      if (result.status === "rejected")
        getLogger().error("browser push delivery failed", { error: result.reason });
    return results.some((result) => result.status === "fulfilled" && result.value)
      ? "delivered"
      : "undeliverable";
  }

  private async live(userId: string): Promise<StoredSubscription[]> {
    const rows = await this.store.list(userId);
    if (!this.sessionExpiresAt) return rows;
    const kept: StoredSubscription[] = [];
    for (const row of rows) {
      const expires = await this.sessionExpiresAt(row.sessionId);
      if (expires && expires.getTime() > Date.now()) kept.push(row);
      else await this.store.removeById(userId, row.id);
    }
    return kept;
  }
}

export type BrowserPushKeys = { publicKey: string; privateKey: string; contact: string };

/** Reads the server's Web Push keys; push to installed web apps is off without all three. */
export function browserPushKeys(
  source: Record<string, string | undefined>,
): BrowserPushKeys | undefined {
  const publicKey = source.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = source.WEB_PUSH_PRIVATE_KEY?.trim();
  const contact = source.WEB_PUSH_CONTACT?.trim();
  if (!publicKey || !privateKey || !contact) return undefined;
  return { publicKey, privateKey, contact };
}

export async function createBrowserPushSender(
  prisma: PrismaClient,
  encryptionKey: string,
  keys: BrowserPushKeys | undefined,
  sessionExpiresAt?: (sessionId: string) => Promise<Date | null>,
): Promise<BrowserPushSender | undefined> {
  if (!keys) return undefined;
  const { createWebPushTransport } = await import(
    "../providers/notifications/web-push/web-push-transport.js"
  );
  const transport = await createWebPushTransport({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: keys.contact,
  });
  return new BrowserPushSender(
    new BrowserPushStore(prisma, encryptionKey),
    transport,
    sessionExpiresAt,
  );
}
