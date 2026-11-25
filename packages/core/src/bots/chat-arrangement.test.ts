import { BOT_COLORS } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  applySectionOrder,
  moveSectionKey,
  sortChatItems,
  tagSections,
} from "./chat-arrangement.js";

const [first, second] = BOT_COLORS;
const bot = (name: string, chat: { color?: string; tags?: string[]; updatedAt?: string } = {}) => ({
  kind: "bot" as const,
  chat: { name, ...chat },
});
const group = (name: string, updatedAt?: string) => ({
  kind: "group" as const,
  chat: { name, updatedAt },
});
const names = (items: readonly { chat: { name: string } }[]) => items.map((item) => item.chat.name);

describe("sortChatItems", () => {
  const items = [
    bot("Writer", { color: second, updatedAt: "2026-11-02T00:00:00Z" }),
    bot("Ads", { color: first, updatedAt: "2026-11-01T00:00:00Z" }),
    group("Team", "2026-11-03T00:00:00Z"),
    bot("Chief", { color: second, updatedAt: "2026-11-04T00:00:00Z" }),
  ];

  it("bundles bots of one color together, groups first, keeping the dragged order within a color", () => {
    expect(names(sortChatItems(items, "color"))).toEqual(["Team", "Ads", "Writer", "Chief"]);
  });

  it("puts the most recently active chat first", () => {
    expect(names(sortChatItems(items, "recent"))).toEqual(["Chief", "Team", "Writer", "Ads"]);
  });

  it("orders by name, or keeps the dragged order", () => {
    expect(names(sortChatItems(items, "name"))).toEqual(["Ads", "Chief", "Team", "Writer"]);
    expect(names(sortChatItems(items, "custom"))).toEqual(names(items));
  });
});

describe("tagSections", () => {
  it("lists group chats, then each tag by latest activity, then untagged bots", () => {
    const sections = tagSections(
      [
        bot("Marketing Chief", { tags: ["Marketing", "Chief"], updatedAt: "2026-11-01T00:00:00Z" }),
        bot("CFO", { tags: ["chief"], updatedAt: "2026-11-05T00:00:00Z" }),
        bot("Scheduler"),
        group("Projects"),
      ],
      "custom",
    );
    expect(sections.map((section) => [section.key, section.tag, names(section.bots)])).toEqual([
      ["groups", null, ["Projects"]],
      ["tag:chief", "Chief", ["Marketing Chief", "CFO"]],
      ["tag:marketing", "Marketing", ["Marketing Chief"]],
      ["untagged", null, ["Scheduler"]],
    ]);
  });
});

describe("saved section order", () => {
  const chat = (name: string, tags: string[] = []) => ({
    kind: "bot" as const,
    chat: { name, tags, updatedAt: "2026-01-01T00:00:00Z" },
  });
  const group = { kind: "group" as const, chat: { name: "Office" } };

  it("puts group chats wherever the person moved them", () => {
    const items = [group, chat("Chief", ["Chiefs"]), chat("Ads", ["Marketing"]), chat("Misc")];
    const keys = tagSections(items, "custom", ["tag:chiefs", "groups"]).map((s) => s.key);
    expect(keys).toEqual(["tag:chiefs", "groups", "tag:marketing", "untagged"]);
  });

  it("keeps the default order without a saved one", () => {
    const items = [chat("Chief", ["Chiefs"]), group];
    expect(tagSections(items, "custom").map((s) => s.key)).toEqual(["groups", "tag:chiefs"]);
  });

  it("moves a key and clamps at the ends", () => {
    expect(moveSectionKey(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveSectionKey(["a", "b", "c"], "a", -5)).toEqual(["a", "b", "c"]);
    expect(moveSectionKey(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(applySectionOrder([{ key: "x" }, { key: "y" }], ["y"])).toEqual([
      { key: "y" },
      { key: "x" },
    ]);
  });
});
