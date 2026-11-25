import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { botTagKey } from "@rakazo/core";
import type { PrismaClient } from "../database/client.js";
import { runAsSystem } from "../database/row-security.js";
import { memberRowsInOrder } from "./groups.js";

type TagTeam = { name: string; botIds: string[] };

/** Each tag's bots, oldest bot first, keyed by the tag's lowercase key. */
export function tagTeams(bots: readonly { id: string; tags: readonly string[] }[]) {
  const teams = new Map<string, TagTeam>();
  for (const bot of bots)
    for (const tag of bot.tags) {
      const key = botTagKey(tag);
      const team = teams.get(key) ?? { name: tag.trim(), botIds: [] };
      if (!team.botIds.includes(bot.id)) team.botIds.push(bot.id);
      teams.set(key, team);
    }
  return teams;
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/**
 * Brings the space's tag group chats in step with its bots' tags: everyone in the space has one
 * group per tag that two or more bots share, with those bots in it. A tag that loses its bots, or
 * a person who left, has the group archived, and it comes back with its history if the tag does.
 * Hand-made groups are never touched.
 */
export async function syncTagGroups(prisma: PrismaClient, spaceId: string): Promise<void> {
  await runAsSystem("keep tag group chats in step with bot tags", async () => {
    const [bots, people, existing] = await Promise.all([
      prisma.bot.findMany({
        where: { spaceId, archivedAt: null },
        select: { id: true, tags: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true } }),
      prisma.chatGroup.findMany({
        where: { spaceId, tagKey: { not: null } },
        select: {
          id: true,
          userId: true,
          tagKey: true,
          name: true,
          archivedAt: true,
          members: { select: { botId: true } },
        },
      }),
    ]);
    const teams = tagTeams(bots);
    const members = (team: TagTeam | undefined) =>
      team && team.botIds.length >= GROUP_MEMBER_MIN
        ? team.botIds.slice(0, GROUP_MEMBER_MAX)
        : undefined;
    const userIds = new Set(people.map((person) => person.userId));
    const kept = new Set<string>();
    for (const group of existing) {
      const botIds = members(teams.get(group.tagKey ?? ""));
      if (!botIds || !userIds.has(group.userId)) {
        if (!group.archivedAt)
          await prisma.chatGroup.update({
            where: { id: group.id },
            data: { archivedAt: new Date(), pinned: false },
          });
        continue;
      }
      kept.add(`${group.userId}:${group.tagKey}`);
      const team = teams.get(group.tagKey ?? "");
      const current = group.members.map((member) => member.botId);
      if (group.archivedAt || group.name !== team?.name || !sameMembers(current, botIds)) {
        await prisma.$transaction(async (tx) => {
          if (!sameMembers(current, botIds)) {
            await tx.chatGroupMember.deleteMany({ where: { groupId: group.id } });
            await tx.chatGroupMember.createMany({ data: memberRowsInOrder(group.id, botIds) });
          }
          await tx.chatGroup.update({
            where: { id: group.id },
            data: { archivedAt: null, name: team?.name ?? group.name },
          });
        });
      }
    }
    for (const [tagKey, team] of teams) {
      const botIds = members(team);
      if (!botIds) continue;
      for (const userId of userIds) {
        if (kept.has(`${userId}:${tagKey}`)) continue;
        await prisma.$transaction(async (tx) => {
          const group = await tx.chatGroup.create({
            data: { spaceId, userId, name: team.name, tagKey },
          });
          await tx.chatGroupMember.createMany({ data: memberRowsInOrder(group.id, botIds) });
          await tx.thread.create({ data: { spaceId, groupId: group.id, userId } });
        });
      }
    }
  });
}
