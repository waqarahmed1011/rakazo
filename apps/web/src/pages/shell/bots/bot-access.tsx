import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, BotAccessLevel } from "@rakazo/contracts";
import { OptionSelect } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useSave, useSpaceQueries } from "../../../lib/query/query";
import { errorText } from "../../../lib/query/user-error";
import { PanelSection } from "./bot-settings-sections";

/**
 * Who may do what with this bot, for its managers: Hidden, Chat or Edit per member. Space admins
 * and the bot's creator always edit, so they are not listed. Nobody else sees this section.
 */
export function BotAccessSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const access = useQuery({
    ...queries.bots.access.queryOptions({ input: { botId: bot.id } }),
    retry: false,
  });
  const save = useSave({
    save: (ask: { botId: string; userId: string; level: BotAccessLevel }, client) =>
      client.bots.setAccess(ask),
    stale: [queries.bots.access.key()],
  });
  const members = (access.data ?? []).filter((member) => !member.fixed);
  if (members.length === 0) return null;
  const labels: Record<BotAccessLevel, string> = {
    hidden: t`Hidden`,
    chat: t`Chat only`,
    edit: t`Can edit`,
  };
  return (
    <PanelSection label={<Trans>Access</Trans>}>
      <ul className="space-y-2">
        {members.map((member) => {
          const asked =
            save.input?.userId === member.userId && save.input.botId === bot.id ? save.input : null;
          return (
            <li key={member.userId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body-sm">
                {member.name || member.email}
              </span>
              <OptionSelect
                aria-label={t`Access for ${member.name || member.email}`}
                className="w-36"
                size="sm"
                value={asked?.level ?? member.level}
                options={(["hidden", "chat", "edit"] as const).map((level) => ({
                  value: level,
                  label: labels[level],
                }))}
                disabled={save.pending}
                onValueChange={(level) => save.run({ botId: bot.id, userId: member.userId, level })}
              />
            </li>
          );
        })}
      </ul>
      {save.error ? (
        <p role="alert" className="mt-2 text-body-sm text-destructive">
          {errorText(save.error, t`Could not change access`)}
        </p>
      ) : null}
    </PanelSection>
  );
}
