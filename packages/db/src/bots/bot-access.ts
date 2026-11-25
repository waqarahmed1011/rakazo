import type { PrismaClient } from "../database/client.js";
import { IsolationError } from "../database/scope.js";
import { isSpaceManager } from "../spaces/space-members.js";

export const BOT_ACCESS_LEVELS = ["hidden", "chat", "edit"] as const;
export type BotAccessLevel = (typeof BOT_ACCESS_LEVELS)[number];

type Actor = { spaceId: string; userId: string };
type Db = Pick<PrismaClient, "bot" | "botAccess" | "spaceMember">;

/** Who decides a bot's access: space admins and the person who made the bot. */
export async function managesBot(db: Db, actor: Actor, botId: string): Promise<boolean> {
  const bot = await db.bot.findFirst({
    where: { id: botId, spaceId: actor.spaceId },
    select: { userId: true },
  });
  if (!bot) throw new IsolationError();
  return bot.userId === actor.userId || (await isSpaceManager(db, actor));
}

/** What this member may do with this bot; anything the bot's managers set aside is edit. */
export async function botAccessLevel(db: Db, actor: Actor, botId: string): Promise<BotAccessLevel> {
  const row = await db.botAccess.findUnique({
    where: { botId_userId: { botId, userId: actor.userId } },
    select: { level: true, spaceId: true },
  });
  if (!row || row.spaceId !== actor.spaceId || row.level === "edit") return "edit";
  if (await managesBot(db, actor, botId)) return "edit";
  return row.level === "hidden" ? "hidden" : "chat";
}

/** Bots this member is not shown, in the spaces given. */
export async function hiddenBotIds(
  db: Pick<PrismaClient, "botAccess">,
  userId: string,
): Promise<Set<string>> {
  const rows = await db.botAccess.findMany({
    where: { userId, level: "hidden" },
    select: { botId: true },
  });
  return new Set(rows.map((row) => row.botId));
}

export async function setBotAccess(
  db: Db,
  actor: Actor,
  input: { botId: string; userId: string; level: BotAccessLevel },
): Promise<void> {
  if (!(await managesBot(db, actor, input.botId))) throw new IsolationError();
  const member = await db.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: actor.spaceId, userId: input.userId } },
    select: { userId: true },
  });
  if (!member) throw new IsolationError();
  if (input.level === "edit") {
    await db.botAccess.deleteMany({ where: { botId: input.botId, userId: input.userId } });
    return;
  }
  await db.botAccess.upsert({
    where: { botId_userId: { botId: input.botId, userId: input.userId } },
    create: {
      spaceId: actor.spaceId,
      botId: input.botId,
      userId: input.userId,
      level: input.level,
    },
    update: { level: input.level },
  });
}
