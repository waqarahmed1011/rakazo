import { describe, expect, it, vi } from "vitest";
import { teamActivity } from "./team-activity.js";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000);

function prisma() {
  const groupBy = vi
    .fn()
    // runs now, runs before
    .mockResolvedValueOnce([
      { botId: "chief", status: "completed", _count: { _all: 6 } },
      { botId: "chief", status: "failed", _count: { _all: 2 } },
      { botId: "inbox", status: "completed", _count: { _all: 3 } },
    ])
    .mockResolvedValueOnce([{ botId: "chief", status: "completed", _count: { _all: 4 } }])
    // costs now, costs before
    .mockResolvedValueOnce([{ botId: "chief", _sum: { costUsd: 1.5 } }])
    .mockResolvedValueOnce([])
    // requests per person
    .mockResolvedValueOnce([{ botId: "chief", userId: "dad", _count: { _all: 5 } }]);
  return {
    spaceMember: {
      findUnique: vi.fn(async () => ({ role: "owner", member: { role: "owner" } })),
    },
    bot: {
      findMany: vi.fn(async () => [
        { id: "chief", minutesSavedPerRun: 30 },
        { id: "inbox", minutesSavedPerRun: null },
      ]),
    },
    run: { groupBy },
    usageRecord: { groupBy },
    approvalWait: {
      findMany: vi.fn(async () => [
        { askedAt: minutesAgo(30), answeredAt: minutesAgo(20) },
        { askedAt: minutesAgo(100), answeredAt: minutesAgo(40) },
        { askedAt: minutesAgo(5), answeredAt: minutesAgo(3) },
      ]),
    },
    user: { findMany: vi.fn(async () => [{ id: "dad", name: "Dad" }]) },
  } as never;
}

describe("teamActivity", () => {
  it("adds up runs, failures, spend and hours saved per bot against the window before", async () => {
    const activity = await teamActivity(prisma(), { spaceId: "s", userId: "u" }, 7, NOW);
    expect(activity.current).toEqual({
      runs: 11,
      failed: 2,
      completed: 9,
      costUsd: 1.5,
      // 6 finished Chief runs at 30 minutes and 3 Inbox runs at the default 10.
      minutesSaved: 210,
    });
    expect(activity.bots[0]).toMatchObject({ botId: "chief", runs: 8, previousRuns: 4 });
    expect(activity.people).toEqual([{ userId: "dad", name: "Dad", botId: "chief", requests: 5 }]);
    expect(activity.answers).toEqual({ count: 3, medianMinutes: 10, slowestMinutes: 60 });
  });
});
