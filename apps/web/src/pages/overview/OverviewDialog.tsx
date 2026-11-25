import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, RunActivityRow } from "@rakazo/contracts";
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
import { X } from "lucide-react";
import type { ReactNode } from "react";
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
  const usageByBot = new Map((usage.data?.bots ?? []).map((row) => [row.id, row]));
  const loadError = navigation.error ?? active.error ?? recent.error;
  const money = (value: number | null | undefined) =>
    value == null
      ? ""
      : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  const open = (run: { botId: string; groupId: string | null }) =>
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
        <div className="truncate text-body-sm text-muted-foreground">
          {run.agentMessage?.kind && run.agentMessage.kind !== "unknown"
            ? `${run.agentMessage.fromBotName}: ${run.agentMessage.text}`
            : run.promptSnippet}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </li>
  );
  const openButton = (run: RunActivityRow) => (
    <Button variant="outline" size="sm" onClick={() => open(run)}>
      <Trans>Open</Trans>
    </Button>
  );

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent showCloseButton={false} size="xl" className="bg-card">
        <DialogHeader className="flex-row items-start justify-between px-8 pt-7">
          <DialogTitle className="text-heading2 text-foreground">
            <Trans>Overview</Trans>
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label={t`Close overview`} />}
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
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label={t`Needs you`} value={String(model.needsYou.length)} />
            <Stat label={t`Stuck`} value={String(model.stuck.length)} />
            <Stat label={t`Working`} value={String(model.working.length)} />
            <Stat label={t`Runs today`} value={String(usage.data?.totals.runs ?? 0)} />
            <Stat label={t`Cost today`} value={money(usage.data?.totals.costUsd) || "0"} />
          </dl>

          {model.needsYou.length + model.stuck.length > 0 ? (
            <section>
              <SectionHeading as="h2">
                <Trans>Needs you</Trans>
              </SectionHeading>
              <ul className="divide-y divide-border">
                {[...model.needsYou, ...model.stuck].map((run) => runRow(run, openButton(run)))}
              </ul>
            </section>
          ) : null}

          {model.working.length > 0 ? (
            <section>
              <SectionHeading as="h2">
                <Trans>Working now</Trans>
              </SectionHeading>
              {stop.error ? (
                <p role="alert" className="text-body-sm text-destructive">
                  {errorText(stop.error, t`Could not stop`)}
                </p>
              ) : null}
              <ul className="divide-y divide-border">
                {model.working.map((run) =>
                  runRow(
                    run,
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
                    </>,
                  ),
                )}
              </ul>
            </section>
          ) : null}

          {bots.length > 0 ? (
            <section>
              <SectionHeading as="h2">
                <Trans>Teams</Trans>
              </SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ...model.teams.map((team) => ({
                    key: team.id,
                    name: team.name,
                    bots: team.bots,
                    groupId: team.id,
                  })),
                  ...(model.unteamed.length
                    ? [{ key: "none", name: t`Not in a team`, bots: model.unteamed, groupId: null }]
                    : []),
                ].map((team) => (
                  <div key={team.key} className="rounded-xl border border-border p-3">
                    {team.groupId ? (
                      <button
                        type="button"
                        className="mb-2 text-body font-medium hover:underline"
                        onClick={() => navigate(`/app/g/${encodeURIComponent(team.groupId ?? "")}`)}
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
              <table className="w-full text-body-sm">
                <thead className="text-start text-label text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-normal">
                      <Trans>Bot</Trans>
                    </th>
                    <th className="py-1 text-start font-normal">
                      <Trans>Latest</Trans>
                    </th>
                    <th className="py-1 text-end font-normal">
                      <Trans>Runs</Trans>
                    </th>
                    <th className="py-1 text-end font-normal">
                      <Trans>Cost</Trans>
                    </th>
                    <th className="py-1 text-end font-normal">
                      <Trans>Next routine</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bots.map((bot, index) => {
                    const today = usageByBot.get(bot.id);
                    const next = nextRoutineRun(routines[index]?.data ?? []);
                    return (
                      <tr key={bot.id}>
                        <td className="py-2 pe-3">
                          <span className="flex items-center gap-2">
                            {avatar(bot.id, 20)}
                            <span className="truncate font-medium">{bot.name}</span>
                          </span>
                        </td>
                        <td className="max-w-0 truncate py-2 pe-3 text-muted-foreground">
                          {bot.preview}
                        </td>
                        <td className="py-2 text-end tabular-nums">{today?.runs ?? 0}</td>
                        <td className="py-2 text-end tabular-nums">{money(today?.costUsd)}</td>
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
                  <Stat
                    key={status}
                    label={ticketLabels[status]}
                    value={String(
                      tickets.data.tickets.filter((ticket) => ticket.status === status).length,
                    )}
                  />
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-heading2 tabular-nums">{value}</dd>
    </div>
  );
}
