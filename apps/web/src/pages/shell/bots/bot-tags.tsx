import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot } from "@rakazo/contracts";
import { BOT_TAG_MAX_LENGTH, BOT_TAGS_MAX } from "@rakazo/contracts";
import { botTagKey, normalizeBotTags, spaceBotTags } from "@rakazo/core";
import { Badge, Button, Input } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useSave, useSpaceQueries } from "../../../lib/query/query";
import { errorText } from "../../../lib/query/user-error";
import { PanelSection } from "./bot-settings-sections";

const MAX_SUGGESTIONS = 8;

/** The bot's team tags; bots sharing a tag get a group chat and a sidebar section together. */
export function BotTagsSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const navigation = useQuery(queries.spaces.list.queryOptions());
  const [draft, setDraft] = useState("");
  const save = useSave({
    save: (ask: { botId: string; tags: string[] }, client) => client.bots.setTags(ask),
    // Tag group chats come back with the space's chat list.
    stale: [queries.spaces.list.key()],
  });
  // A save in flight or one that failed shows what was asked for, so the chips never jump back.
  const asked = save.input?.botId === bot.id && (save.pending || save.error) ? save.input : null;
  const tags = asked?.tags ?? bot.tags ?? [];
  const has = (tag: string) => tags.some((own) => botTagKey(own) === botTagKey(tag));
  const needle = botTagKey(draft);
  const suggestions = spaceBotTags(navigation.data?.current.bots ?? [])
    .filter((tag) => !has(tag) && botTagKey(tag).includes(needle))
    .slice(0, MAX_SUGGESTIONS);
  const apply = (next: string[]) => {
    save.run({ botId: bot.id, tags: normalizeBotTags(next) });
    setDraft("");
  };
  const full = tags.length >= BOT_TAGS_MAX;

  return (
    <PanelSection label={<Trans>Tags</Trans>}>
      {tags.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={t`Tags`}>
          {tags.map((tag) => (
            <li key={botTagKey(tag)}>
              <Badge variant="secondary" className="gap-1 ps-2.5 pe-1 text-body-sm font-normal">
                {tag}
                <button
                  type="button"
                  aria-label={t`Remove tag ${tag}`}
                  className="rounded-full p-0.5 hover:bg-accent"
                  disabled={save.pending}
                  onClick={() => apply(tags.filter((own) => own !== tag))}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {full ? null : (
        <Input
          value={draft}
          maxLength={BOT_TAG_MAX_LENGTH}
          placeholder={t`Add a tag, like Marketing`}
          aria-label={t`Add a tag`}
          disabled={save.pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !draft.trim()) return;
            event.preventDefault();
            apply([...tags, draft]);
          }}
        />
      )}
      {!full && suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <Button
              key={botTagKey(tag)}
              variant="outline"
              size="sm"
              disabled={save.pending}
              onClick={() => apply([...tags, tag])}
            >
              <Plus aria-hidden />
              {tag}
            </Button>
          ))}
        </div>
      ) : null}
      {asked && save.error ? (
        <p role="alert" className="mt-2 text-body-sm text-destructive">
          {errorText(save.error, t`Could not save tags`)}
        </p>
      ) : null}
    </PanelSection>
  );
}
