import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, TeamActivity } from "@rakazo/contracts";
import { OptionSelect, SectionHeading } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useSpaceQueries } from "../../lib/query/query";

const PEOPLE_SHOWN = 8;

/**
 * What the bots did for the business over the last week or month: hours saved first, then runs,
 * failures, spend and how long answers took, each against the period before. Space admins only;
 * for anyone else the section stays hidden.
 */
export function ImpactSection({
  bots,
  avatar,
  money,
}: {
  bots: readonly Bot[];
  avatar: (botId: string, size?: number) => ReactNode;
  money: (value: number | null | undefined) => string;
}) {
  const { t } = useLingui();
  const periodId = useId();
  const queries = useSpaceQueries();
  const [days, setDays] = useState<7 | 30>(7);
  const activity = useQuery({
    ...queries.usage.team.queryOptions({ input: { days } }),
    retry: false,
  });
  const data = activity.data;
  if (!data) return null;
  const names = new Map(bots.map((bot) => [bot.id, bot.name]));
  const hours = (minutes: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(minutes / 60);
  const minutes = (value: number | null) =>
    value === null ? "" : value < 60 ? t`${Math.round(value)} min` : t`${hours(value)} h`;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <SectionHeading as="h2">
          <Trans>Impact</Trans>
        </SectionHeading>
        <OptionSelect
          aria-label={t`Period`}
          id={periodId}
          size="sm"
          value={String(days) as "7" | "30"}
          options={[
            { value: "7", label: t`Last 7 days` },
            { value: "30", label: t`Last 30 days` },
          ]}
          onValueChange={(next) => setDays(next === "30" ? 30 : 7)}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile
          label={t`Hours saved (est.)`}
          value={hours(data.current.minutesSaved)}
          change={trend(data.current.minutesSaved, data.previous.minutesSaved)}
        />
        <Tile
          label={t`Runs`}
          value={String(data.current.runs)}
          change={trend(data.current.runs, data.previous.runs)}
        />
        <Tile
          label={t`Failed`}
          value={String(data.current.failed)}
          change={trend(data.current.failed, data.previous.failed)}
        />
        <Tile label={t`Spend`} value={money(data.current.costUsd)} />
        <Tile label={t`Your answer time`} value={minutes(data.answers.medianMinutes) || "0"} />
      </dl>
      {data.bots.length > 0 ? (
        <table className="mt-4 w-full table-fixed text-body-sm">
          <thead className="text-label text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">
                <Trans>Bot</Trans>
              </th>
              <th className="w-20 py-1 text-end font-normal">
                <Trans>Runs</Trans>
              </th>
              <th className="w-16 py-1 text-end font-normal">
                <Trans>Failed</Trans>
              </th>
              <th className="w-24 py-1 text-end font-normal">
                <Trans>Hours saved</Trans>
              </th>
              <th className="w-24 py-1 text-end font-normal">
                <Trans>Spend</Trans>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.bots.map((row) => (
              <BotRow
                key={row.botId}
                row={row}
                name={names.get(row.botId) ?? ""}
                {...{ avatar, money, hours }}
              />
            ))}
          </tbody>
        </table>
      ) : null}
      {data.people.length > 0 ? (
        <div className="mt-4">
          <SectionHeading variant="label" className="mb-1">
            <Trans>Who uses which bots</Trans>
          </SectionHeading>
          <ul className="divide-y divide-border">
            {data.people.slice(0, PEOPLE_SHOWN).map((row) => (
              <li
                key={`${row.userId}:${row.botId}`}
                className="flex items-center gap-2 py-1.5 text-body-sm"
              >
                <span className="w-32 shrink-0 truncate font-medium">{row.name}</span>
                {avatar(row.botId, 20)}
                <span className="flex-1 truncate">{names.get(row.botId) ?? ""}</span>
                <span className="tabular-nums text-muted-foreground">
                  <Trans>{row.requests} requests</Trans>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The change from the period before, as a signed whole percent; nothing when there was none. */
function trend(now: number, before: number): string | undefined {
  if (before === 0) return undefined;
  const percent = Math.round(((now - before) / before) * 100);
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function Tile({ label, value, change }: { label: string; value: string; change?: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="truncate text-heading2 tabular-nums">{value}</span>
        {change ? <span className="text-label text-muted-foreground">{change}</span> : null}
      </dd>
    </div>
  );
}

function BotRow({
  row,
  name,
  avatar,
  money,
  hours,
}: {
  row: TeamActivity["bots"][number];
  name: string;
  avatar: (botId: string, size?: number) => ReactNode;
  money: (value: number | null | undefined) => string;
  hours: (minutes: number) => string;
}) {
  const change = trend(row.runs, row.previousRuns);
  return (
    <tr>
      <td className="py-2 pe-3">
        <span className="flex min-w-0 items-center gap-2">
          {avatar(row.botId, 20)}
          <span className="truncate font-medium">{name}</span>
        </span>
      </td>
      <td className="py-2 text-end tabular-nums">
        {row.runs}
        {change ? <span className="ms-1 text-label text-muted-foreground">{change}</span> : null}
      </td>
      <td className="py-2 text-end tabular-nums">{row.failed}</td>
      <td className="py-2 text-end tabular-nums">{hours(row.minutesSaved)}</td>
      <td className="py-2 text-end tabular-nums">{money(row.costUsd)}</td>
    </tr>
  );
}
