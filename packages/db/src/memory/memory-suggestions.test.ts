import { describe, expect, it, vi } from "vitest";
import { proposeSharedMemory } from "./memory-suggestions.js";

const input = {
  spaceId: "space-1",
  userId: "user-1",
  botId: "bot-1",
  path: "jobs.md",
  content: "Job 101: framing",
  baseRevision: 4,
};

describe("proposeSharedMemory", () => {
  it("replaces the same proposer's pending change to a document instead of adding another", async () => {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({ id: "new" }));
    const prisma = {
      memorySuggestion: { findFirst: vi.fn(async () => ({ id: "pending-1" })), update, create },
    } as never;
    await expect(proposeSharedMemory(prisma, input)).resolves.toEqual({ id: "pending-1" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "pending-1" },
      data: { content: "Job 101: framing", baseRevision: 4 },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
