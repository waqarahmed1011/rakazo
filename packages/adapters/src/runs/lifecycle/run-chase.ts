import {
  ModelAccountError,
  SandboxAllowanceUsedError,
  SandboxProviderAccountError,
  TransientModelError,
} from "@rakazo/adapter-kit";
import { groupLeadBotId } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { messageBot } from "../../messaging/bot-messages.js";
import type { ExecutorDeps } from "../executor/executor-deps.js";
import { DailyRunLimitError } from "./run-budget.js";
import { chaseFailedRunMessage } from "./run-chase.prompt.js";

/** Work a person or a schedule started. A failed bot-to-bot run already reports to its sender. */
const CHASED_TRIGGERS: readonly string[] = ["user", "routine", "tickets", "webhook"];

/** Failures only a person can fix: an account, a quota or the day's run limit. */
function ownersToFix(error: unknown): boolean {
  return (
    error instanceof ModelAccountError ||
    error instanceof TransientModelError ||
    error instanceof SandboxAllowanceUsedError ||
    error instanceof SandboxProviderAccountError ||
    error instanceof DailyRunLimitError
  );
}

/** The lead of a tag team the bot belongs to, other than the bot itself. */
export async function teamLeadFor(
  prisma: Pick<PrismaClient, "chatGroup">,
  run: { spaceId: string; userId: string },
  botId: string,
): Promise<string | undefined> {
  const teams = await prisma.chatGroup.findMany({
    where: {
      spaceId: run.spaceId,
      userId: run.userId,
      archivedAt: null,
      tagKey: { not: null },
      members: { some: { botId } },
    },
    select: {
      leadBotId: true,
      members: {
        where: { bot: { archivedAt: null } },
        select: { botId: true },
        orderBy: [{ createdAt: "asc" }, { botId: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const team of teams) {
    const lead = groupLeadBotId(team.members, team.leadBotId);
    if (lead && lead !== botId) return lead;
  }
  return undefined;
}

/**
 * Hands a failed run to its team's chief before it reaches the owner's Stuck list. The chief
 * gets one message per failed run, so a retry that fails again is chased once more, not looped.
 */
export async function chaseFailedRun(
  deps: Pick<ExecutorDeps, "prisma" | "events" | "jobs" | "runLease">,
  run: {
    id: string;
    spaceId: string;
    threadId: string;
    botId: string;
    userId: string;
    trigger: string;
    sourceMessageId?: string | null;
  },
  bot: { id: string; name: string },
  failure: string,
  error: unknown,
): Promise<void> {
  if (!CHASED_TRIGGERS.includes(run.trigger) || ownersToFix(error)) return;
  const lead = await teamLeadFor(deps.prisma, run, bot.id);
  if (!lead) return;
  await messageBot(
    deps,
    run,
    bot,
    {
      bot_id: lead,
      message: chaseFailedRunMessage(failure),
      intent: "request",
      deliveryKey: `chase:${run.id}`,
    },
    { returnFrom: "ended" },
  );
}
