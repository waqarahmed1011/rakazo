import type { TeamActivity } from "@rakazo/contracts";
import { DEFAULT_MINUTES_SAVED_PER_RUN } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { requireSpaceOwner, runAsSystem } from "@rakazo/db";

const DAY_MS = 24 * 60 * 60_000;

type Window = { gte: Date; lt: Date };
type Counts = TeamActivity["current"];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const round = (minutes: number) => Math.round(minutes * 10) / 10;

/**
 * Every member's bot activity in the space over the last `days`, and the same span before it, so
 * the dashboard can show trends. Space admins only: it reads all members' runs.
 */
export async function teamActivity(
  prisma: PrismaClient,
  actor: { spaceId: string; userId: string },
  days: 7 | 30,
  now = Date.now(),
): Promise<TeamActivity> {
  await requireSpaceOwner(prisma, actor);
  const current: Window = { gte: new Date(now - days * DAY_MS), lt: new Date(now) };
  const previous: Window = { gte: new Date(now - 2 * days * DAY_MS), lt: current.gte };
  const { spaceId } = actor;
  return runAsSystem("read the space's bot activity for its admins", async () => {
    const [bots, runsNow, runsBefore, costNow, costBefore, requests, waits] = await Promise.all([
      prisma.bot.findMany({
        where: { spaceId },
        select: { id: true, minutesSavedPerRun: true },
      }),
      prisma.run.groupBy({
        by: ["botId", "status"],
        where: { spaceId, createdAt: current },
        _count: { _all: true },
      }),
      prisma.run.groupBy({
        by: ["botId", "status"],
        where: { spaceId, createdAt: previous },
        _count: { _all: true },
      }),
      prisma.usageRecord.groupBy({
        by: ["botId"],
        where: { spaceId, createdAt: current },
        _sum: { costUsd: true },
      }),
      prisma.usageRecord.groupBy({
        by: ["botId"],
        where: { spaceId, createdAt: previous },
        _sum: { costUsd: true },
      }),
      prisma.run.groupBy({
        by: ["botId", "userId"],
        where: { spaceId, trigger: "user", createdAt: current },
        _count: { _all: true },
      }),
      prisma.approvalWait.findMany({
        where: { spaceId, answeredAt: current },
        select: { askedAt: true, answeredAt: true },
      }),
    ]);
    const minutesPerRun = new Map(
      bots.map((bot) => [bot.id, bot.minutesSavedPerRun ?? DEFAULT_MINUTES_SAVED_PER_RUN]),
    );
    const tally = (
      runs: typeof runsNow,
      costs: typeof costNow,
    ): { total: Counts; byBot: Map<string, Counts> } => {
      const byBot = new Map<string, Counts>();
      const entry = (botId: string) => {
        const found = byBot.get(botId);
        if (found) return found;
        const fresh: Counts = { runs: 0, failed: 0, completed: 0, costUsd: null, minutesSaved: 0 };
        byBot.set(botId, fresh);
        return fresh;
      };
      for (const row of runs) {
        const counts = entry(row.botId);
        counts.runs += row._count._all;
        if (row.status === "failed") counts.failed += row._count._all;
        if (row.status === "completed") {
          counts.completed += row._count._all;
          counts.minutesSaved += row._count._all * (minutesPerRun.get(row.botId) ?? 0);
        }
      }
      for (const row of costs) {
        if (!row.botId || row._sum.costUsd == null) continue;
        const counts = entry(row.botId);
        counts.costUsd = (counts.costUsd ?? 0) + row._sum.costUsd;
      }
      const total: Counts = { runs: 0, failed: 0, completed: 0, costUsd: null, minutesSaved: 0 };
      for (const counts of byBot.values()) {
        total.runs += counts.runs;
        total.failed += counts.failed;
        total.completed += counts.completed;
        total.minutesSaved += counts.minutesSaved;
        if (counts.costUsd != null) total.costUsd = (total.costUsd ?? 0) + counts.costUsd;
      }
      return { total, byBot };
    };
    const now_ = tally(runsNow, costNow);
    const before = tally(runsBefore, costBefore);
    const people = await prisma.user.findMany({
      where: { id: { in: [...new Set(requests.map((row) => row.userId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(people.map((person) => [person.id, person.name]));
    const minutes = waits.map(
      (wait) => (wait.answeredAt.getTime() - wait.askedAt.getTime()) / 60_000,
    );
    const middle = median(minutes);
    return {
      days,
      current: now_.total,
      previous: before.total,
      bots: [...now_.byBot.entries()]
        .map(([botId, counts]) => ({
          botId,
          ...counts,
          previousRuns: before.byBot.get(botId)?.runs ?? 0,
          minutesPerRun: minutesPerRun.get(botId) ?? DEFAULT_MINUTES_SAVED_PER_RUN,
        }))
        .sort((a, b) => b.runs - a.runs),
      people: requests
        .map((row) => ({
          userId: row.userId,
          name: names.get(row.userId) ?? "",
          botId: row.botId,
          requests: row._count._all,
        }))
        .sort((a, b) => b.requests - a.requests),
      answers: {
        count: minutes.length,
        medianMinutes: middle === null ? null : round(middle),
        slowestMinutes: minutes.length ? round(Math.max(...minutes)) : null,
      },
    };
  });
}
