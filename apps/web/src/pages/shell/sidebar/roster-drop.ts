import { GROUP_MEMBER_MAX } from "@rakazo/contracts";
import { chatKey } from "@rakazo/core";

export type DraggedChat = {
  kind: "bot" | "group";
  id: string;
  sectionId: string | null;
  pinned: boolean;
};

type Placed = { id: string; sectionId: string | null; pinned: boolean };

export type RosterDropTarget =
  | { kind: "bot"; chat: Placed }
  | { kind: "group"; chat: Placed & { memberIds: readonly string[] } }
  | { kind: "section"; sectionId: string | null };

export type RosterDropAction =
  | { action: "reorder"; targetKey: string }
  | { action: "move"; sectionId: string | null }
  | { action: "join"; groupId: string; botIds: string[] };

/** Same list: reorder onto the target. Another section: move there. Pinned chats only reorder. */
function placeOn(
  dragged: DraggedChat,
  target: Placed,
  targetKey: string,
  sameList: boolean,
): RosterDropAction | null {
  if (targetKey === chatKey(dragged)) return null;
  if (dragged.pinned !== target.pinned) return null;
  if (dragged.pinned || target.sectionId === dragged.sectionId) {
    return sameList ? { action: "reorder", targetKey } : null;
  }
  return { action: "move", sectionId: target.sectionId };
}

/**
 * Decide what dropping a dragged bot or group chat on a sidebar target does. Dropping on a
 * chat in the same list reorders; dropping on another section (its header or one of its rows)
 * moves it there; dropping a bot on a group chat adds the bot as a member. Returns null when
 * the drop should be refused.
 */
export function resolveRosterDrop(input: {
  dragged: DraggedChat;
  target: RosterDropTarget;
  /** True when the target and dragged rows belong to the same visible list. */
  sameList: boolean;
}): RosterDropAction | null {
  const { dragged, target, sameList } = input;
  switch (target.kind) {
    case "bot":
      return placeOn(dragged, target.chat, chatKey({ kind: "bot", id: target.chat.id }), sameList);
    case "section": {
      if (dragged.pinned || target.sectionId === dragged.sectionId) return null;
      return { action: "move", sectionId: target.sectionId };
    }
    case "group": {
      if (dragged.kind === "group") {
        return placeOn(
          dragged,
          target.chat,
          chatKey({ kind: "group", id: target.chat.id }),
          sameList,
        );
      }
      const members = target.chat.memberIds;
      if (members.includes(dragged.id) || members.length >= GROUP_MEMBER_MAX) return null;
      return { action: "join", groupId: target.chat.id, botIds: [...members, dragged.id] };
    }
  }
}
