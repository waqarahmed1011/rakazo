import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, MemoryDocument } from "@rakazo/contracts";
import { Button, SectionHeading } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSave, useSpaceQueries } from "../../lib/query/query";
import { errorText } from "../../lib/query/user-error";

const NO_DOCS: MemoryDocument[] = [];

/**
 * The company brain: what every bot in the space reads as shared memory, and the changes bots and
 * members proposed for it. Proposals show only to space admins, who approve or reject each one.
 */
export function CompanyBrainSection({
  bots,
  avatar,
}: {
  bots: readonly Bot[];
  avatar: (botId: string, size?: number) => ReactNode;
}) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const docs = useQuery(queries.memory.list.queryOptions({ input: { scope: "user" } }));
  const suggestions = useQuery({ ...queries.memory.suggestions.queryOptions(), retry: false });
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [outdated, setOutdated] = useState(false);
  const decide = useSave({
    save: (ask: { id: string; approve: boolean }, client) => client.memory.decideSuggestion(ask),
    stale: [queries.memory.key()],
    onSaved: (result) => setOutdated(result.outcome === "outdated"),
  });
  const names = new Map(bots.map((bot) => [bot.id, bot.name]));
  const documents = docs.data ?? NO_DOCS;
  const pending = suggestions.data ?? [];
  if (documents.length === 0 && pending.length === 0) return null;
  return (
    <section>
      <SectionHeading as="h2">
        <Trans>Company brain</Trans>
      </SectionHeading>
      {pending.length > 0 ? (
        <div className="mb-3">
          <SectionHeading variant="label" className="mb-1">
            <Trans>Waiting for your approval</Trans>
          </SectionHeading>
          {decide.error ? (
            <p role="alert" className="text-body-sm text-destructive">
              {errorText(decide.error, t`Could not save the decision`)}
            </p>
          ) : null}
          {outdated ? (
            <p className="text-body-sm text-muted-foreground">
              <Trans>
                That change was out of date, so it was set aside. The bot can propose it again.
              </Trans>
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {pending.map((item) => (
              <li key={item.id} className="py-2">
                <div className="flex items-center gap-2">
                  {item.botId ? avatar(item.botId, 20) : null}
                  <span className="min-w-0 flex-1 truncate text-body font-medium">
                    {item.content === null ? t`Delete ${item.path}` : item.path}
                  </span>
                  <span className="shrink-0 text-label text-muted-foreground">
                    {item.botId ? (names.get(item.botId) ?? "") : t`A member`}
                  </span>
                  <Button
                    size="sm"
                    disabled={decide.pending}
                    onClick={() => decide.run({ id: item.id, approve: true })}
                  >
                    <Trans>Approve</Trans>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={decide.pending}
                    onClick={() => decide.run({ id: item.id, approve: false })}
                  >
                    <Trans>Reject</Trans>
                  </Button>
                </div>
                {item.content !== null ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Excerpt label={t`Now`} text={item.current ?? t`New document`} />
                    <Excerpt label={t`Proposed`} text={item.content} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {documents.map((doc) => {
          const shown = openPath === doc.path;
          return (
            <li key={doc.id}>
              <button
                type="button"
                aria-expanded={shown}
                onClick={() => setOpenPath(shown ? null : doc.path)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-accent"
              >
                <span className="flex-1 truncate text-body">{doc.path}</span>
                <ChevronDown
                  aria-hidden
                  className={`size-4 text-muted-foreground ${shown ? "" : "-rotate-90 rtl:rotate-90"}`}
                />
              </button>
              {shown ? (
                <pre className="max-h-80 overflow-auto px-4 pb-3 text-body-sm whitespace-pre-wrap text-muted-foreground">
                  {doc.content}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Excerpt({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-label text-muted-foreground">{label}</div>
      <pre className="max-h-40 overflow-auto text-body-sm whitespace-pre-wrap">{text}</pre>
    </div>
  );
}
