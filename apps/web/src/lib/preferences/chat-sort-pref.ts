import type { ChatSort } from "@rakazo/core";
import { CHAT_SORTS } from "@rakazo/core";
import { createStoredPreference } from "./stored-preference";

/** Color by default: bots are colored by team, so a team stays together. */
export function normalizeChatSort(raw: string | null | undefined): ChatSort {
  return CHAT_SORTS.find((sort) => sort === raw?.trim()) ?? "color";
}

export const chatSortPreference = createStoredPreference<ChatSort>({
  key: "rakazo.chatSort",
  parse: normalizeChatSort,
  serialize: normalizeChatSort,
});
