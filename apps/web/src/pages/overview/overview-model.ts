import type { Bot, Group, RunActivityRow } from "@rakazo/contracts";
import { activitySections, botTagKey, isRunWaitingOnUser, spaceBotTags } from "@rakazo/core";

export type OverviewTeam = { id: string | null; name: string; bots: Bot[] };

/**
 * What the overview shows: runs waiting on a person, runs that stalled or failed, live work,
 * and the space's teams (its group chats) with every bot that sits in none of them.
 */
export function overviewModel({
  active,
  recent,
  bots,
  groups,
  now = Date.now(),
}: {
  active: readonly RunActivityRow[];
  recent: readonly RunActivityRow[];
  bots: readonly Bot[];
  groups: readonly Group[];
  now?: number;
}) {
  const sections = activitySections({ active, recent, bots, groups, now });
  const needsYou = sections.attention.filter((run) => isRunWaitingOnUser(run.status));
  const stuck = sections.attention.filter((run) => !isRunWaitingOnUser(run.status));
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const liveGroups = groups.filter((group) => !group.archivedAt);
  // Tags are the org chart once bots have them; each team opens its tag's group chat.
  const tags = spaceBotTags(bots);
  const teams: OverviewTeam[] =
    tags.length > 0
      ? tags.map((tag) => ({
          id: liveGroups.find((group) => group.tagKey === botTagKey(tag))?.id ?? null,
          name: tag,
          bots: bots.filter((bot) => bot.tags?.some((own) => botTagKey(own) === botTagKey(tag))),
        }))
      : liveGroups.map((group) => ({
          id: group.id,
          name: group.name,
          bots: group.members.flatMap((member) => byId.get(member.botId) ?? []),
        }));
  const inTeam = new Set(teams.flatMap((team) => team.bots.map((bot) => bot.id)));
  return {
    needsYou,
    stuck,
    working: sections.working,
    teams,
    unteamed: bots.filter((bot) => !inTeam.has(bot.id)),
  };
}

/** The soonest scheduled run among a bot's routines, if any is scheduled. */
export function nextRoutineRun(routines: readonly { nextRunAt: string | null }[]): string | null {
  return (
    routines
      .flatMap((routine) => (routine.nextRunAt ? [routine.nextRunAt] : []))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
  );
}
