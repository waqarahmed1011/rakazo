import { Trans, useLingui } from "@lingui/react/macro";
import type { Artifact } from "@rakazo/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { decodeArtifactBase64, downloadArtifactBytes } from "../../../lib/pages/artifact-open";
import { useSave, useSpaceQueries } from "../../../lib/query/query";
import { errorText } from "../../../lib/query/user-error";

const SHOWN = 8;

/** The newest files the Space's bots made, under the chat list, each with its own actions. */
export function SidebarArtifacts({ open }: { open: (path: string) => void }) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const queryClient = useQueryClient();
  const listing = useQuery(
    queries.artifacts.listSpace.queryOptions({ input: { madeByBots: true, limit: SHOWN } }),
  );
  const [pendingDelete, setPendingDelete] = useState<Artifact | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const remove = useSave({
    save: (artifact: Artifact, client) => client.artifacts.remove({ artifactId: artifact.id }),
    stale: [queries.artifacts.listSpace.key()],
    onSaved: () => setPendingDelete(null),
  });
  const items = listing.data?.items ?? [];
  if (items.length === 0) return null;

  async function download(artifact: Artifact) {
    setDownloadError(null);
    try {
      const full = await queryClient.fetchQuery(
        queries.artifacts.getById.queryOptions({ input: { artifactId: artifact.id } }),
      );
      downloadArtifactBytes(full.name, full.mimeType, decodeArtifactBase64(full.contentBase64));
    } catch (error) {
      setDownloadError(errorText(error, t`Could not download this artifact.`));
    }
  }

  return (
    <section aria-label={t`Artifacts`} data-testid="sidebar-artifacts" className="mt-2">
      <button
        type="button"
        onClick={() => open("/app/artifacts")}
        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-body-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <Trans>Artifacts</Trans>
      </button>
      <ul className="flex flex-col gap-0.5">
        {items.map((artifact) => (
          <li
            key={artifact.id}
            className="group/artifact flex items-center rounded-lg hover:bg-sidebar-accent"
          >
            <button
              type="button"
              onClick={() => open(`/app/artifacts/${artifact.id}`)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            >
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span dir="auto" className="truncate">
                {artifact.name}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="me-1 shrink-0 text-muted-foreground"
                    aria-label={t`Actions for ${artifact.name}`}
                  />
                }
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => open(`/app/artifacts/${artifact.id}`)}>
                  <ExternalLink />
                  <Trans>Open</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void download(artifact)}>
                  <Download />
                  <Trans>Download</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(artifact)}>
                  <Trash2 />
                  <Trans>Delete</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      {downloadError ? (
        <p role="alert" className="px-2.5 pt-1 text-body-sm text-destructive">
          {downloadError}
        </p>
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          onCancel={() => {
            setPendingDelete(null);
            remove.reset();
          }}
          title={<Trans>Delete "{pendingDelete.name}"?</Trans>}
          description={<Trans>This can't be undone.</Trans>}
          error={remove.error ? errorText(remove.error, t`Could not delete this artifact.`) : null}
          busy={remove.pending}
          onConfirm={() => remove.run(pendingDelete)}
          confirmLabel={remove.pending ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
        />
      ) : null}
    </section>
  );
}
