import { describe, expect, it, vi } from "vitest";
import { botAccessLevel } from "./bot-access.js";

const actor = { spaceId: "space-1", userId: "user-1" };

function db(row: { level: string; spaceId: string } | null, botOwner = "owner-1", role = "member") {
  return {
    botAccess: { findUnique: vi.fn(async () => row) },
    bot: { findFirst: vi.fn(async () => ({ userId: botOwner })) },
    spaceMember: { findUnique: vi.fn(async () => ({ role, member: { role: "member" } })) },
  } as never;
}

describe("botAccessLevel", () => {
  it("is edit with no saved level, and the saved level otherwise", async () => {
    expect(await botAccessLevel(db(null), actor, "bot-1")).toBe("edit");
    expect(await botAccessLevel(db({ level: "chat", spaceId: "space-1" }), actor, "bot-1")).toBe(
      "chat",
    );
    expect(await botAccessLevel(db({ level: "hidden", spaceId: "space-1" }), actor, "bot-1")).toBe(
      "hidden",
    );
  });

  it("always lets the bot's creator and space admins edit", async () => {
    const hidden = { level: "hidden", spaceId: "space-1" };
    expect(await botAccessLevel(db(hidden, "user-1"), actor, "bot-1")).toBe("edit");
    expect(await botAccessLevel(db(hidden, "owner-1", "owner"), actor, "bot-1")).toBe("edit");
  });
});
