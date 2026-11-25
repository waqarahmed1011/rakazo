import { BOT_COLORS } from "@rakazo/contracts";
import { botTagKey } from "./bot-tags.js";

/** How the sidebar orders chats within a section. "custom" keeps the order people dragged. */
export const CHAT_SORTS = ["color", "recent", "name", "custom"] as const;
export type ChatSort = (typeof CHAT_SORTS)[number];

type ArrangedChat = {
  kind: "bot" | "group";
  chat: { name: string; color?: string; tags?: readonly string[]; updatedAt?: string };
};

function colorRank(color: string | undefined): number {
  const index = color ? BOT_COLORS.indexOf(color) : -1;
  return index < 0 ? BOT_COLORS.length : index;
}

const time = (item: ArrangedChat) => Date.parse(item.chat.updatedAt ?? "") || 0;

/** Chats in the chosen order; ties keep their incoming (dragged) order. Groups lead a color sort. */
export function sortChatItems<T extends ArrangedChat>(items: readonly T[], sort: ChatSort): T[] {
  if (sort === "custom") return [...items];
  const order = items.map((item, index) => ({ item, index }));
  order.sort((a, b) => {
    if (sort === "recent") return time(b.item) - time(a.item) || a.index - b.index;
    if (sort === "name")
      return a.item.chat.name.localeCompare(b.item.chat.name) || a.index - b.index;
    const kind = (item: ArrangedChat) => (item.kind === "group" ? 0 : 1);
    return (
      kind(a.item) - kind(b.item) ||
      colorRank(a.item.chat.color) - colorRank(b.item.chat.color) ||
      a.index - b.index
    );
  });
  return order.map((entry) => entry.item);
}

export type TagSection<T> = { key: string; tag: string | null; bots: T[] };

/**
 * Sidebar sections by tag: group chats first, then one section per tag (a bot with two tags is in
 * both), most recently active first, then the bots with no tag. Empty sections are left out.
 */
export function tagSections<T extends ArrangedChat>(
  items: readonly T[],
  sort: ChatSort,
): TagSection<T>[] {
  const groups = items.filter((item) => item.kind === "group");
  const tags = new Map<string, { tag: string; bots: T[] }>();
  const untagged: T[] = [];
  for (const item of items) {
    if (item.kind === "group") continue;
    const own = item.chat.tags ?? [];
    if (own.length === 0) untagged.push(item);
    for (const tag of own) {
      const key = botTagKey(tag);
      const section = tags.get(key) ?? { tag, bots: [] };
      if (!section.bots.includes(item)) section.bots.push(item);
      tags.set(key, section);
    }
  }
  const latest = (bots: readonly T[]) => Math.max(0, ...bots.map(time));
  const tagged = [...tags.entries()].sort(
    ([, a], [, b]) => latest(b.bots) - latest(a.bots) || a.tag.localeCompare(b.tag),
  );
  return [
    { key: "groups", tag: null, bots: sortChatItems(groups, sort) },
    ...tagged.map(([key, section]) => ({
      key: `tag:${key}`,
      tag: section.tag,
      bots: sortChatItems(section.bots, sort),
    })),
    { key: "untagged", tag: null, bots: sortChatItems(untagged, sort) },
  ].filter((section) => section.bots.length > 0);
}
