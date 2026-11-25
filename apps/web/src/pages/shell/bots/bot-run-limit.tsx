import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot } from "@rakazo/contracts";
import { OptionSelect } from "@rakazo/ui-web";
import { useId } from "react";
import { useSave, useSpaceQueries } from "../../../lib/query/query";
import { errorText } from "../../../lib/query/user-error";
import { PanelSection } from "./bot-settings-sections";

const CHOICES = ["default", "10", "20", "80", "150", "0"] as const;
type Choice = (typeof CHOICES)[number];

/** Caps how often the bot runs without a person asking (routines, other bots, tickets). */
export function BotRunLimitSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const labelId = useId();
  const queries = useSpaceQueries();
  const save = useSave({
    save: (ask: { botId: string; limit: number | null }, client) =>
      client.bots.setDailyRunLimit(ask),
    stale: [queries.spaces.list.key()],
  });
  const asked = save.input?.botId === bot.id && (save.pending || save.error) ? save.input : null;
  const limit = asked ? asked.limit : (bot.dailyRunLimit ?? null);
  const value: Choice =
    limit === null ? "default" : (CHOICES.find((choice) => choice === String(limit)) ?? "default");
  const labels: Record<Choice, string> = {
    default: t`40 (default)`,
    "10": "10",
    "20": "20",
    "80": "80",
    "150": "150",
    "0": t`No limit`,
  };
  return (
    <PanelSection label={<span id={labelId}>{<Trans>Runs on its own per day</Trans>}</span>}>
      <OptionSelect
        aria-labelledby={labelId}
        className="w-full"
        value={value}
        options={CHOICES.map((choice) => ({ value: choice, label: labels[choice] }))}
        disabled={save.pending}
        onValueChange={(next) =>
          save.run({ botId: bot.id, limit: next === "default" ? null : Number(next) })
        }
      />
      {asked && save.error ? (
        <p role="alert" className="mt-2 text-body-sm text-destructive">
          {errorText(save.error, t`Could not save the limit`)}
        </p>
      ) : null}
    </PanelSection>
  );
}

const MINUTES = ["default", "5", "15", "30", "60", "0"] as const;
type Minutes = (typeof MINUTES)[number];

/** The minutes of a person's work one finished run stands in for, behind "Hours saved". */
export function BotMinutesSavedSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const labelId = useId();
  const queries = useSpaceQueries();
  const save = useSave({
    save: (ask: { botId: string; minutes: number | null }, client) =>
      client.bots.setMinutesSaved(ask),
    stale: [queries.spaces.list.key(), queries.usage.team.key()],
  });
  const asked = save.input?.botId === bot.id && (save.pending || save.error) ? save.input : null;
  const minutes = asked ? asked.minutes : (bot.minutesSavedPerRun ?? null);
  const value: Minutes =
    minutes === null
      ? "default"
      : (MINUTES.find((choice) => choice === String(minutes)) ?? "default");
  const labels: Record<Minutes, string> = {
    default: t`10 min (default)`,
    "5": t`5 min`,
    "15": t`15 min`,
    "30": t`30 min`,
    "60": t`1 hour`,
    "0": t`Don't count`,
  };
  return (
    <PanelSection label={<span id={labelId}>{<Trans>Time saved per task</Trans>}</span>}>
      <OptionSelect
        aria-labelledby={labelId}
        className="w-full"
        value={value}
        options={MINUTES.map((choice) => ({ value: choice, label: labels[choice] }))}
        disabled={save.pending}
        onValueChange={(next) =>
          save.run({ botId: bot.id, minutes: next === "default" ? null : Number(next) })
        }
      />
      {asked && save.error ? (
        <p role="alert" className="mt-2 text-body-sm text-destructive">
          {errorText(save.error, t`Could not save`)}
        </p>
      ) : null}
    </PanelSection>
  );
}
