import { appContract } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { botTargetOf, isSharedWrite, spaceRoleMayCall } from "./viewer-access.js";

function procedurePaths(node: unknown, path: string[] = []): string[][] {
  if (!node || typeof node !== "object") return [];
  if ("~orpc" in node) return [path];
  return Object.entries(node).flatMap(([key, child]) => procedurePaths(child, [...path, key]));
}

const paths = procedurePaths(appContract);
const allowed = (name: string) => spaceRoleMayCall("viewer", name.split("."));

describe("spaceRoleMayCall", () => {
  it("lets owners and members call everything", () => {
    for (const path of paths) {
      expect(spaceRoleMayCall("owner", path)).toBe(true);
      expect(spaceRoleMayCall("member", path)).toBe(true);
    }
  });

  it("keeps viewers out of what the space shares", () => {
    for (const name of [
      "bots.create",
      "bots.update",
      "bots.remove",
      "memory.update",
      "memory.remove",
      "routines.create",
      "routines.update",
      "spaces.rename",
      "spaces.members.add",
      "spaces.invites.create",
      "computer.takeover",
      "computer.input",
      "pages.remove",
      "threads.clear",
    ]) {
      expect(paths.map((path) => path.join("."))).toContain(name);
      expect(allowed(name), name).toBe(false);
    }
  });

  it("lets viewers chat, answer approvals, manage their own account and leave", () => {
    for (const name of [
      "threads.send",
      "threads.answer",
      "threads.markRead",
      "spaces.members.leave",
      "spaces.invites.accept",
      "models.connect",
      "voice.connect",
      "preferences.update",
      "notifications.registerPush",
      "connections.begin",
    ]) {
      expect(paths.map((path) => path.join("."))).toContain(name);
      expect(allowed(name), name).toBe(true);
    }
  });
});

describe("per-bot read-only access", () => {
  it("treats bot changes as shared writes and chatting as allowed", () => {
    expect(isSharedWrite(["bots", "update"])).toBe(true);
    expect(isSharedWrite(["routines", "create"])).toBe(true);
    expect(isSharedWrite(["threads", "send"])).toBe(false);
    expect(isSharedWrite(["bots", "list"])).toBe(false);
  });

  it("finds the bot a call names", () => {
    expect(botTargetOf({ botId: "bot-1", text: "hi" })).toBe("bot-1");
    expect(botTargetOf({ groupId: "group-1" })).toBeUndefined();
    expect(botTargetOf(undefined)).toBeUndefined();
  });
});
