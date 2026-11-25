import type { PrismaClient } from "@rakazo/db";

/** What a bot may start on its own in a day when its settings name no limit. */
export const DEFAULT_DAILY_RUN_LIMIT = 40;
const DAY_MS = 24 * 60 * 60_000;

/** Runs a bot starts without a person asking: these are what the daily limit counts. */
export const SELF_STARTED_TRIGGERS: readonly string[] = [
  "routine",
  "bot_message",
  "webhook",
  "tickets",
  "follow_up",
  "spawn",
  "cloud_agent",
];

export class DailyRunLimitError extends Error {
  /** Only the day's first refusal tells the owner; later ones end quietly. */
  constructor(
    limit: number,
    readonly repeat: boolean,
  ) {
    super(
      `This bot already started ${limit} runs on its own in the last 24 hours, its daily limit. It can run again later, or the limit can be raised in its settings.`,
    );
    this.name = "DailyRunLimitError";
  }
}

/** 0 turns the limit off; no saved value keeps the default. */
export function dailyRunLimit(saved: number | null | undefined): number {
  return saved ?? DEFAULT_DAILY_RUN_LIMIT;
}

/**
 * Stops a self-started run once its bot has used its day's allowance, before any model call.
 * A person's own messages are never counted or stopped.
 */
export async function assertWithinDailyRunLimit(
  prisma: Pick<PrismaClient, "bot" | "run">,
  run: { id: string; botId: string; trigger: string },
  now = Date.now(),
): Promise<void> {
  if (!SELF_STARTED_TRIGGERS.includes(run.trigger)) return;
  const bot = await prisma.bot.findUnique({
    where: { id: run.botId },
    select: { dailyRunLimit: true },
  });
  const limit = dailyRunLimit(bot?.dailyRunLimit);
  if (limit === 0) return;
  const started = await prisma.run.count({
    where: {
      botId: run.botId,
      id: { not: run.id },
      trigger: { in: [...SELF_STARTED_TRIGGERS] },
      createdAt: { gte: new Date(now - DAY_MS) },
    },
  });
  if (started >= limit) throw new DailyRunLimitError(limit, started > limit);
}
