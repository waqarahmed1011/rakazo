import type { Bot, Group, RunActivityRow } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { nextRoutineRun, overviewModel } from "./overview-model";

const now = Date.parse("2026-11-20T15:00:00Z");
const bot = (id: string) => ({ id, name: id, unread: false }) as unknown as Bot;
const run = (botId: string, status: RunActivityRow["status"], minutesAgo = 1) =>
  ({
    runId: `run-${botId}`,
    botId,
    botName: botId,
    groupId: null,
    groupName: null,
    threadId: `thread-${botId}`,
    status,
    updatedAt: new Date(now - minutesAgo * 60_000).toISOString(),
  }) as RunActivityRow;
const group = (id: string, botIds: string[]) =>
  ({
    id,
    name: id,
    archivedAt: null,
    unread: false,
    members: botIds.map((botId) => ({ botId })),
  }) as unknown as Group;

describe("overviewModel", () => {
  it("splits what waits on a person from live work", () => {
    const model = overviewModel({
      active: [run("inbox", "waiting_input"), run("scheduler", "running")],
      recent: [],
      bots: [bot("inbox"), bot("scheduler")],
      groups: [],
      now,
    });
    expect(model.needsYou.map((item) => item.botId)).toEqual(["inbox"]);
    expect(model.working.map((item) => item.botId)).toEqual(["scheduler"]);
    expect(model.stuck).toEqual([]);
  });

  it("puts each bot under its team and lists the rest apart", () => {
    const model = overviewModel({
      active: [],
      recent: [],
      bots: [bot("chief"), bot("inbox"), bot("scout")],
      groups: [group("office", ["chief", "inbox"])],
      now,
    });
    expect(model.teams).toEqual([
      { id: "office", name: "office", bots: [bot("chief"), bot("inbox")] },
    ]);
    expect(model.unteamed.map((item) => item.id)).toEqual(["scout"]);
  });
});

describe("nextRoutineRun", () => {
  it("picks the soonest scheduled run", () => {
    expect(
      nextRoutineRun([
        { nextRunAt: null },
        { nextRunAt: "2026-11-21T12:00:00Z" },
        { nextRunAt: "2026-11-20T18:00:00Z" },
      ]),
    ).toBe("2026-11-20T18:00:00Z");
    expect(nextRoutineRun([{ nextRunAt: null }])).toBeNull();
  });
});
