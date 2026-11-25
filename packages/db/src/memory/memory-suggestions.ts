import type { PrismaClient } from "../database/client.js";

export type MemorySuggestionInput = {
  spaceId: string;
  userId: string;
  botId?: string | null;
  path: string;
  /** null proposes deleting the document. */
  content: string | null;
  baseRevision: number;
};

/**
 * Records a proposed change to the shared memory. A bot's or person's newer proposal for the same
 * document replaces their pending one, so a bot that saves again does not pile up duplicates.
 */
export async function proposeSharedMemory(
  prisma: Pick<PrismaClient, "memorySuggestion">,
  input: MemorySuggestionInput,
): Promise<{ id: string }> {
  const pending = await prisma.memorySuggestion.findFirst({
    where: {
      spaceId: input.spaceId,
      path: input.path,
      status: "pending",
      userId: input.userId,
      botId: input.botId ?? null,
    },
    select: { id: true },
  });
  const data = { content: input.content, baseRevision: input.baseRevision };
  if (pending) {
    await prisma.memorySuggestion.update({ where: { id: pending.id }, data });
    return pending;
  }
  return prisma.memorySuggestion.create({
    data: {
      spaceId: input.spaceId,
      userId: input.userId,
      botId: input.botId ?? null,
      path: input.path,
      ...data,
    },
    select: { id: true },
  });
}

export async function pendingMemorySuggestions(
  prisma: Pick<PrismaClient, "memorySuggestion">,
  spaceId: string,
) {
  return prisma.memorySuggestion.findMany({
    where: { spaceId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

/** Marks a pending suggestion decided; null when it was not pending in this space. */
export async function closeMemorySuggestion(
  prisma: Pick<PrismaClient, "memorySuggestion">,
  input: { spaceId: string; id: string; decidedByUserId: string },
  status: "approved" | "rejected" | "outdated",
): Promise<boolean> {
  const { count } = await prisma.memorySuggestion.updateMany({
    where: { id: input.id, spaceId: input.spaceId, status: "pending" },
    data: { status, decidedByUserId: input.decidedByUserId, decidedAt: new Date() },
  });
  return count > 0;
}
