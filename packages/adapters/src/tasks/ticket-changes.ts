import type { JobPublisher, NotificationProvider } from "@rakazo/adapter-kit";
import type { LabFeature } from "@rakazo/contracts";
import type { BoardEvents, PrismaClient } from "@rakazo/db";
import { bestEffort } from "@rakazo/logging";
import { wakeTicketAssignee } from "./ticket-wake.js";

export type TicketChange = {
  spaceId: string;
  boardId: string;
  ticketId: string;
  assigneeBotId: string | null;
  wakeAssignee: boolean;
  /** A bot offered this work; its owner is asked to approve it. */
  offer?: { title: string; botId: string | null };
};
export type TicketChangeNotifier = (change: TicketChange) => Promise<void>;

export function createTicketChangeNotifier(deps: {
  boardEvents: BoardEvents;
  prisma: PrismaClient;
  jobs: JobPublisher;
  deploymentLabs?: readonly LabFeature[];
  notifications?: NotificationProvider;
}): TicketChangeNotifier {
  return async (change) => {
    await deps.boardEvents
      .notify(change.spaceId, {
        boardId: change.boardId,
        ticketId: change.ticketId,
      })
      .catch(() => undefined);
    if (change.wakeAssignee && change.assigneeBotId) {
      await wakeTicketAssignee(deps, {
        spaceId: change.spaceId,
        ticketId: change.ticketId,
        botId: change.assigneeBotId,
      });
    }
    if (change.offer) await bestEffort("offer notification", notifyOffer(deps, change));
  };
}

/** Tells the owner of the offering bot that it proposed work, with the ticket to approve. */
async function notifyOffer(
  deps: { prisma: PrismaClient; notifications?: NotificationProvider },
  change: TicketChange,
): Promise<void> {
  const botId = change.offer?.botId ?? change.assigneeBotId;
  if (!deps.notifications || !change.offer || !botId) return;
  const bot = await deps.prisma.bot.findFirst({
    where: { id: botId, spaceId: change.spaceId, archivedAt: null },
    select: { id: true, name: true, userId: true, thread: { select: { id: true } } },
  });
  if (!bot?.thread) return;
  await deps.notifications.send(
    {
      kind: "help",
      title: bot.name,
      body: change.offer.title,
      botId: bot.id,
      threadId: bot.thread.id,
      ticketId: change.ticketId,
    },
    {
      operationId: "offer",
      traceId: change.ticketId,
      spaceId: change.spaceId,
      userId: bot.userId,
      botId: bot.id,
      signal: new AbortController().signal,
    },
  );
}
