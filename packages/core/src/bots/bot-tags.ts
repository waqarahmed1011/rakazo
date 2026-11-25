/** The key a tag is matched by: case and spacing never make two tags. */
export function botTagKey(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Tags as saved: trimmed, single-spaced, first spelling kept, no repeats, no blanks. */
export function normalizeBotTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tag of tags) {
    const name = tag.trim().replace(/\s+/g, " ");
    const key = botTagKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}

/** Every tag in use, one spelling each (the first bot's), sorted by name. */
export function spaceBotTags(bots: readonly { tags?: readonly string[] }[]): string[] {
  const names = new Map<string, string>();
  for (const bot of bots)
    for (const tag of bot.tags ?? []) {
      const key = botTagKey(tag);
      if (!names.has(key)) names.set(key, tag);
    }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
