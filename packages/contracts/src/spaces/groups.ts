import * as z from "zod";
import { BotAvatarSetSchema } from "../bots/bot-avatar.js";
import { Id } from "../ids.js";
import { ThreadMessageSchema } from "../threads/thread-message.js";

export const GroupMemberSchema = z.object({
  botId: Id,
  name: z.string(),
  color: z.string(),
  avatarSet: BotAvatarSetSchema.optional(),
  status: z.string().optional(),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GROUP_MEMBER_MIN = 2;
export const GROUP_MEMBER_MAX = 25;
export const GROUP_NAME_MAX_LENGTH = 80;

/** Preserve pick order and the group name limit without splitting a surrogate pair. */
export function defaultGroupName(names: readonly string[]): string {
  const value = names.join(", ").trim().slice(0, GROUP_NAME_MAX_LENGTH);
  const last = value.charCodeAt(value.length - 1);
  return (last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value).trim();
}

export const GroupSchema = z.object({
  id: Id,
  spaceId: Id,
  name: z.string(),
  pinned: z.boolean(),
  sectionId: Id.nullable(),
  /** Sidebar order, in the same sequence as bots' positions. */
  position: z.number().int().nonnegative().optional(),
  /** The member a message naming nobody goes to; null means the first member. */
  leadBotId: Id.nullable().optional(),
  /** The bot tag this group follows; its members change with the tag. */
  tagKey: z.string().nullable().optional(),
  archivedAt: z.string().nullable(),
  members: z.array(GroupMemberSchema),
  threadId: Id,
  preview: z.string(),
  unread: z.boolean(),
  /** Hidden from the viewer's chat list until then; past, the chat has just woken. */
  snoozedUntil: z.string().nullable().optional(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

/** The member that messages naming nobody go to: the chosen lead while it is a member, else the first. */
export function groupLeadBotId(
  members: readonly { botId: string }[],
  leadBotId: string | null | undefined,
): string | undefined {
  return (members.find((member) => member.botId === leadBotId) ?? members[0])?.botId;
}

const GroupBotIds = z
  .array(Id)
  .min(GROUP_MEMBER_MIN)
  .max(GROUP_MEMBER_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { error: "botIds must be distinct" });

export const CreateGroupInput = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH),
  botIds: GroupBotIds,
});
export type CreateGroupInput = z.infer<typeof CreateGroupInput>;

export const UpdateGroupInput = z.object({
  groupId: Id,
  name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH).optional(),
  botIds: GroupBotIds.optional(),
  /** Reject a membership replacement when another client changed the active roster. */
  expectedBotIds: z.array(Id).max(GROUP_MEMBER_MAX).optional(),
  pinned: z.boolean().optional(),
  sectionId: Id.nullable().optional(),
  leadBotId: Id.nullable().optional(),
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupInput>;

export const GroupDetailSchema = GroupSchema.extend({
  messages: z.array(ThreadMessageSchema).optional(),
});
