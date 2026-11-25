import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, RunActivityRow, UsageBreakdown } from "@rakazo/contracts";
import { hasLab, TICKET_STATUSES } from "@rakazo/contracts";
import {
  BotAvatar,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SectionHeading,
} from "@rakazo/ui-web";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatRelativeTime } from "../../lib/locale/relative-time";
import { useSave, useSpaceQueries } from "../../lib/query/query";
import { errorText } from "../../lib/query/user-error";
import { FALLBACK_BOT_COLOR } from "../shell/chat/chat-shared";
import { useTicketStatusLabels } from "../space/ticket-status";
import { nextRoutineRun, overviewModel } from "./overview-model";

const NO_RUNS: RunActivityRow[] = [];
const NO_BOTS: Bot[] = [];
const live = { refetchOnWindowFocus: "always" } as const;
const STATS = ["needsYou", "stuck", "working", "runs", "cost"] as const;
type Stat = (typeof STATS)[number];

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Every bot in the space at a glance: what needs a person, what is running, teams and today. */
export function OverviewDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queries = useSpaceQueries();
  const boardEnabled = hasLab(useQuery(queries.me.queryOptions()).data?.labs, "board");
  const navigation = useQuery(queries.spaces.list.queryOptions(live));
  const active = useQuery(queries.runs.list.queryOptions({ input: { filter: "active" }, ...live }));
  const recent = useQuery(queries.runs.list.queryOptions({ input: { filter: "recent" }, ...live }));
  const usage = useQuery(queries.usage.breakdown.queryOptions({ input: { range: "today" } }));
  const bots = navigation.data?.current.bots ?? NO_BOTS;
  const groups = navigation.data?.current.groups ?? [];
  const routines = useQueries({
    queries: bots.map((bot) => queries.routines.list.queryOptions({ input: { botId: bot.id } })),
  });
  const tickets = useQuery({
    ...queries.tickets.list.queryOptions({ input: {} }),
    enabled: boardEnabled,
  });
  const ticketLabels = useTicketStatusLabels();
  const [open, setOpen] = useState<ReadonlySet<Stat>>(new Set());
  const toggle = (stat: Stat) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(stat)) next.add(stat);
      return next;
    });
  const stop = useSave({
    save: (run: RunActivityRow, client) =>
      client.threads.stop(run.groupId ? { groupId: run.groupId } : { botId: run.botId }),
    stale: [queries.runs.list.key()],
  });
  const model = overviewModel({
    active: active.data?.runs ?? NO_RUNS,
    recent: recent.data?.runs ?? NO_RUNS,
    bots,
    groups,
  });
  const today = usage.data;
  const usageByBot = new Map((today?.bots ?? []).map((row) => [row.id, row]));
  const loadError = navigation.error ?? active.error ?? recent.error ?? usage.error;
  const money = (value: number | null | undefined) =>
    value == null
      ? t`Not priced`
      : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  const openRun = (run: { botId: string; groupId: string | null }) =>
    navigate(
      run.groupId
        ? `/app/g/${encodeURIComponent(run.groupId)}`
        : `/app/${encodeURIComponent(run.botId)}`,
    );
  const botById = new Map(bots.map((bot) => [bot.id, bot]));
  const avatar = (botId: string, size = 28) => {
    const bot = botById.get(botId);
    return (
      <BotAvatar
        identity={botId}
        color={bot?.color ?? FALLBACK_BOT_COLOR}
        avatarSet={bot?.avatarSet}
        size={size}
      />
    );
  };
  // A new bot's first turn runs on an internal setup prompt; say what it waits for instead.
  const preview = (run: RunActivityRow) =>
    run.agentMessage?.kind && run.agentMessage.kind !== "unknown"
      ? `${run.agentMessage.fromBotName}: ${run.agentMessage.text}`
      : run.trigger === "created"
        ? t`Waiting for your answer to its setup question`
        : run.promptSnippet;
  const runRow = (run: RunActivityRow, actions: ReactNode) => (
    <li key={run.runId} className="flex items-center gap-3 py-2">
      {avatar(run.botId)}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body font-medium">{run.botName}</span>
          {run.groupName ? (
            <span className="truncate text-label text-muted-foreground">{run.groupName}</span>
          ) : null}
          <span className="ms-auto shrink-0 text-label text-muted-foreground">
            {formatRelativeTime(run.updatedAt)}
          </span>
        </div>
        <div className="truncate text-body-sm text-muted-foreground">{preview(run)}</div>
      </div>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </li>
  );
  const openButton = (run: RunActivityRow) => (
    <Button variant="outline" size="sm" onClick={() => openRun(run)}>
      <Trans>Open</Trans>
    </Button>
  );
  const runList = (runs: RunActivityRow[], empty: ReactNode, actions = openButton) =>
    runs.length > 0 ? (
      <ul className="divide-y divide-border">{runs.map((run) => runRow(run, actions(run)))}</ul>
    ) : (
      <p className="py-2 text-body-sm text-muted-foreground">{empty}</p>
    );
  const labels: Record<Stat, string> = {
    needsYou: t`Needs you`,
    stuck: t`Stuck`,
    working: t`Working`,
    runs: t`Runs today`,
    cost: t`Cost today`,
  };
  const values: Record<Stat, string> = {
    needsYou: String(model.needsYou.length),
    stuck: String(model.stuck.length),
    working: String(model.working.length),
    runs: String(today?.totals.runs ?? 0),
    cost: money(today?.totals.costUsd),
  };
  const bodies: Record<Stat, ReactNode> = {
    needsYou: runList(model.needsYou, <Trans>Nothing is waiting on you.</Trans>),
    stuck: runList(model.stuck, <Trans>No bot is stuck.</Trans>),
    working: (
      <>
        {stop.error ? (
          <p role="alert" className="text-body-sm text-destructive">
            {errorText(stop.error, t`Could not stop`)}
          </p>
        ) : null}
        {runList(model.working, <Trans>No bot is working right now.</Trans>, (run) => (
          <>
            {openButton(run)}
            <Button
              variant="outline"
              size="sm"
              disabled={stop.pending}
              onClick={() => stop.run(run)}
            >
              <Trans>Stop</Trans>
            </Button>
          </>
        ))}
      </>
    ),
    runs: <RunsToday usage={today} recent={recent.data?.runs ?? NO_RUNS} avatar={avatar} />,
    cost: <CostToday usage={today} money={money} avatar={avatar} />,
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent showCloseButton={false} size="xl" className="bg-card">
        <DialogHeader className="flex-row items-start justify-between px-8 pt-7">
          <DialogTitle className="text-heading2 text-foreground">
            <Trans>Dashboard</Trans>
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label={t`Close dashboard`} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 space-y-8 overflow-y-auto px-8 pt-5 pb-8"
          data-testid="overview"
        >
          {loadError ? (
            <p role="alert" className="text-body text-destructive">
              {errorText(loadError)}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {STATS.map((stat) => (
              <button
                key={stat}
                type="button"
                aria-expanded={open.has(stat)}
                aria-controls={`dashboard-${stat}`}
                onClick={() => toggle(stat)}
                className={`rounded-xl border px-3 py-2 text-start hover:bg-accent ${
                  open.has(stat) ? "border-foreground" : "border-border"
                }`}
              >
                <div className="text-label text-muted-foreground">{labels[stat]}</div>
                <div className="truncate text-heading2 tabular-nums">{values[stat]}</div>
              </button>
            ))}
          </div>

          <div className="divide-y divide-border rounded-xl border border-border">
            {STATS.map((stat) => (
              <section key={stat} id={`dashboard-${stat}`}>
                <button
                  type="button"
                  aria-expanded={open.has(stat)}
                  onClick={() => toggle(stat)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-start hover:bg-accent"
                >
                  <span className="flex-1 text-body font-medium">{labels[stat]}</span>
                  <span className="text-body tabular-nums text-muted-foreground">
                    {values[stat]}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={`size-4 text-muted-foreground motion-safe:transition-transform ${
                      open.has(stat) ? "" : "-rotate-90 rtl:rotate-90"
                    }`}
                  />
                </button>
                {open.has(stat) ? <div className="px-4 pb-3">{bodies[stat]}</div> : null}
              </section>
            ))}
          </div>

          {bots.length > 0 ? (
            <section>
              <SectionHeading as="h2">
                <Trans>Teams</Trans>
              </SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ...model.teams.map((team) => ({ key: team.name, ...team })),
                  ...(model.unteamed.length
                    ? [{ key: "", id: null, name: t`Not in a team`, bots: model.unteamed }]
                    : []),
                ].map((team) => (
                  <div key={team.key} className="rounded-xl border border-border p-3">
                    {team.id ? (
                      <button
                        type="button"
                        className="mb-2 text-body font-medium hover:underline"
                        onClick={() => navigate(`/app/g/${encodeURIComponent(team.id ?? "")}`)}
                      >
                        {team.name}
                      </button>
                    ) : (
                      <div className="mb-2 text-body font-medium text-muted-foreground">
                        {team.name}
                      </div>
                    )}
                    <ul className="flex flex-wrap gap-2">
                      {team.bots.map((bot) => (
                        <li key={bot.id}>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-accent"
                            onClick={() => navigate(`/app/${encodeURIComponent(bot.id)}`)}
                          >
                            {avatar(bot.id, 20)}
                            <span className="text-body-sm">{bot.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {bots.length > 0 ? (
            <section>
              <SectionHeading as="h2">
                <Trans>Today</Trans>
              </SectionHeading>
              <table className="w-full table-fixed text-body-sm">
                <thead className="text-label text-muted-foreground">
                  <tr>
                    <th className="w-1/3 py-1 text-start font-normal">
                      <Trans>Bot</Trans>
                    </th>
                    <th className="py-1 text-start font-normal">
                      <Trans>Latest</Trans>
                    </th>
                    <th className="w-14 py-1 text-end font-normal">
                      <Trans>Runs</Trans>
                    </th>
                    <th className="w-24 py-1 text-end font-normal">
                      <Trans>Cost</Trans>
                    </th>
                    <th className="w-28 py-1 text-end font-normal">
                      <Trans>Next routine</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bots.map((bot, index) => {
                    const row = usageByBot.get(bot.id);
                    const next = nextRoutineRun(routines[index]?.data ?? []);
                    return (
                      <tr key={bot.id}>
                        <td className="py-2 pe-3">
                          <span className="flex min-w-0 items-center gap-2">
                            {avatar(bot.id, 20)}
                            <span className="truncate font-medium">{bot.name}</span>
                          </span>
                        </td>
                        <td
                          className="truncate py-2 pe-3 text-muted-foreground"
                          title={bot.preview}
                        >
                          {bot.preview}
                        </td>
                        <td className="py-2 text-end tabular-nums">{row?.runs ?? 0}</td>
                        <td className="py-2 text-end tabular-nums">
                          {row ? money(row.costUsd) : ""}
                        </td>
                        <td className="py-2 text-end text-muted-foreground">
                          {next
                            ? new Date(next).toLocaleString(undefined, {
                                weekday: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : null}

          {boardEnabled && tickets.data ? (
            <section>
              <div className="flex items-center justify-between">
                <SectionHeading as="h2">
                  <Trans>Board</Trans>
                </SectionHeading>
                <Button variant="ghost" size="sm" onClick={() => navigate("/app/board")}>
                  <Trans>Open board</Trans>
                </Button>
              </div>
              <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {TICKET_STATUSES.map((status) => (
                  <div key={status} className="rounded-xl border border-border px-3 py-2">
                    <dt className="text-label text-muted-foreground">{ticketLabels[status]}</dt>
                    <dd className="text-heading2 tabular-nums">
                      {tickets.data.tickets.filter((ticket) => ticket.status === status).length}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Runs per bot today, busiest first, with the routines behind them and what they last did. */
function RunsToday({
  usage,
  recent,
  avatar,
}: {
  usage: UsageBreakdown | undefined;
  recent: readonly RunActivityRow[];
  avatar: (botId: string, size?: number) => ReactNode;
}) {
  const rows = [...(usage?.bots ?? [])]
    .filter((bot) => bot.runs > 0)
    .sort((a, b) => b.runs - a.runs);
  if (rows.length === 0)
    return (
      <p className="py-2 text-body-sm text-muted-foreground">
        <Trans>No runs yet today.</Trans>
      </p>
    );
  return (
    <ul className="divide-y divide-border">
      {rows.map((bot) => {
        const routines = (usage?.routines ?? []).filter(
          (routine) => routine.id && routine.botName === bot.name && routine.runs > 0,
        );
        const latest = recent
          .filter((run) => run.botId === bot.id && isToday(run.updatedAt))
          .slice(0, 3);
        return (
          <li key={bot.id} className="flex gap-3 py-2">
            {avatar(bot.id)}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-body font-medium">{bot.name ?? ""}</span>
                <span className="ms-auto shrink-0 text-body-sm tabular-nums">
                  <Trans>{bot.runs} runs</Trans>
                </span>
              </div>
              {routines.map((routine) => (
                <div key={routine.id} className="truncate text-body-sm text-muted-foreground">
                  <Trans>
                    Routine {routine.name}: {routine.runs}
                  </Trans>
                </div>
              ))}
              {latest.map((run) => (
                <div key={run.runId} className="truncate text-body-sm text-muted-foreground">
                  {formatRelativeTime(run.updatedAt)} · {run.promptSnippet}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Today's spend per bot and per model, largest first; a model with no price says so. */
function CostToday({
  usage,
  money,
  avatar,
}: {
  usage: UsageBreakdown | undefined;
  money: (value: number | null | undefined) => string;
  avatar: (botId: string, size?: number) => ReactNode;
}) {
  const byCost = <T extends { costUsd: number | null }>(rows: readonly T[]) =>
    [...rows].sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1));
  const bots = byCost((usage?.bots ?? []).filter((bot) => bot.runs > 0));
  const models = byCost(usage?.models ?? []);
  if (bots.length === 0)
    return (
      <p className="py-2 text-body-sm text-muted-foreground">
        <Trans>No spend yet today.</Trans>
      </p>
    );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <SectionHeading variant="label" className="mb-1">
          <Trans>By bot</Trans>
        </SectionHeading>
        <ul className="divide-y divide-border">
          {bots.map((bot) => (
            <li key={bot.id} className="flex items-center gap-2 py-1.5 text-body-sm">
              {avatar(bot.id, 20)}
              <span className="flex-1 truncate">{bot.name ?? ""}</span>
              <span className="tabular-nums">{money(bot.costUsd)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <SectionHeading variant="label" className="mb-1">
          <Trans>By model</Trans>
        </SectionHeading>
        <ul className="divide-y divide-border">
          {models.map((row) => (
            <li
              key={`${row.provider}/${row.model}`}
              className="flex items-center gap-2 py-1.5 text-body-sm"
            >
              <span className="flex-1 truncate">{row.model}</span>
              <span className="text-muted-foreground tabular-nums">
                {Intl.NumberFormat(undefined, { notation: "compact" }).format(row.totalTokens ?? 0)}
              </span>
              <span className="w-20 text-end tabular-nums">{money(row.costUsd)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
