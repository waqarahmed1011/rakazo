import { describe, expect, it, vi } from "vitest";
import { teamLeadFor } from "./run-chase.js";

function prisma(teams: Array<{ leadBotId: string | null; members: string[] }>) {
  return {
    chatGroup: {
      findMany: vi.fn(async () =>
        teams.map((team) => ({
          leadBotId: team.leadBotId,
          members: team.members.map((botId) => ({ botId })),
        })),
      ),
    },
  } as never;
}

describe("teamLeadFor", () => {
  const run = { spaceId: "space-1", userId: "user-1" };

  it("finds the chief of the bot's team, skipping a team the bot leads itself", async () => {
    const lead = await teamLeadFor(
      prisma([
        { leadBotId: "inbox", members: ["inbox", "scheduler"] },
        { leadBotId: "chief", members: ["inbox", "chief"] },
      ]),
      run,
      "inbox",
    );
    expect(lead).toBe("chief");
  });

  it("falls back to the first member, and finds no one for a bot in no team", async () => {
    expect(await teamLeadFor(prisma([{ leadBotId: null, members: ["a", "b"] }]), run, "b")).toBe(
      "a",
    );
    expect(await teamLeadFor(prisma([]), run, "b")).toBeUndefined();
  });
});
