import { describe, expect, it, vi } from "vitest";
import { assertWithinDailyRunLimit, DailyRunLimitError } from "./run-budget.js";

function prisma(limit: number | null, started: number) {
  return {
    bot: { findUnique: vi.fn(async () => ({ dailyRunLimit: limit })) },
    run: { count: vi.fn(async () => started) },
  } as never;
}

describe("assertWithinDailyRunLimit", () => {
  const run = { id: "run-1", botId: "bot-1", trigger: "routine" };

  it("stops a self-started run once the bot used its day's allowance", async () => {
    await expect(assertWithinDailyRunLimit(prisma(null, 40), run)).rejects.toMatchObject({
      repeat: false,
    });
    // Refused runs count too, so only the first refusal of the day tells the owner.
    await expect(assertWithinDailyRunLimit(prisma(null, 41), run)).rejects.toMatchObject({
      repeat: true,
    });
    await expect(assertWithinDailyRunLimit(prisma(null, 39), run)).resolves.toBeUndefined();
    await expect(assertWithinDailyRunLimit(prisma(5, 5), run)).rejects.toBeInstanceOf(
      DailyRunLimitError,
    );
  });

  it("never stops a person's own message, or a bot set to no limit", async () => {
    const counted = prisma(5, 500);
    await expect(
      assertWithinDailyRunLimit(counted, { ...run, trigger: "user" }),
    ).resolves.toBeUndefined();
    await expect(assertWithinDailyRunLimit(prisma(0, 500), run)).resolves.toBeUndefined();
  });
});
