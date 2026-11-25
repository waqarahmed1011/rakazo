import { Trans, useLingui } from "@lingui/react/macro";
import { Button, cn, Input } from "@rakazo/ui-web";
import { useId, useState } from "react";

type Choice = { id: string; label: string; description?: string };

const OTHER = "other";

/** What a multi-pick sends: the chosen labels on one line, which the bot reads as the answer. */
export function joinChoiceLabels(labels: readonly string[]): string {
  return labels.join("; ");
}

/**
 * A bot's question as pickable options: one or several, each with a line saying what it means,
 * and "Something else" to type an answer instead. Nothing is sent until Submit; Skip answers that
 * the person passed. Answered, the chosen rows stay marked and the rest dim.
 */
export function ChoiceQuestion({
  choices,
  multiple,
  other,
  answer,
  disabled,
  pending,
  onSubmit,
}: {
  choices: readonly Choice[];
  multiple: boolean;
  other: boolean;
  /** The stored answer once answered: an option id, joined labels, or typed text. */
  answer: string | undefined;
  disabled: boolean;
  pending: boolean;
  onSubmit: (value: string) => void;
}) {
  const { t } = useLingui();
  const name = useId();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [typed, setTyped] = useState("");
  const answered = answer !== undefined;
  const answeredIds = answered ? answeredChoiceIds(answer, choices) : new Set<string>();
  const typedAnswer = answered && answeredIds.size === 0 ? answer : undefined;
  const checked = (id: string) => (answered ? answeredIds.has(id) : picked.has(id));
  const toggle = (id: string) =>
    setPicked((current) => {
      if (!multiple) return new Set([id]);
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const otherPicked = picked.has(OTHER);
  const value = (() => {
    const labels = choices.filter((choice) => picked.has(choice.id));
    const own = otherPicked ? typed.trim() : "";
    if (!multiple) return own || labels[0]?.id || "";
    return joinChoiceLabels([...labels.map((choice) => choice.label), ...(own ? [own] : [])]);
  })();
  const rows: Choice[] = [
    ...choices,
    ...(other && !answered ? [{ id: OTHER, label: t`Something else` }] : []),
  ];
  return (
    <div className="mt-3">
      <fieldset className="space-y-1" disabled={answered || disabled || pending}>
        <legend className="sr-only">{multiple ? t`Pick any` : t`Pick one`}</legend>
        {rows.map((choice) => (
          <label
            key={choice.id}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg px-2 py-2 hover:bg-accent",
              answered && !checked(choice.id) && "opacity-50",
              answered && "cursor-default hover:bg-transparent",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={checked(choice.id)}
              onChange={() => toggle(choice.id)}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-body-lg",
                  choice.id === OTHER && !otherPicked && "text-muted-foreground",
                )}
              >
                {choice.label}
              </span>
              {choice.description ? (
                <span className="block text-body text-muted-foreground">{choice.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      {otherPicked && !answered ? (
        <Input
          autoFocus
          className="mt-2"
          value={typed}
          placeholder={t`Type your answer`}
          aria-label={t`Your answer`}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && value) {
              event.preventDefault();
              onSubmit(value);
            }
          }}
        />
      ) : null}
      {typedAnswer ? (
        <blockquote className="mt-2 border-s-2 border-border ps-3 text-body-lg whitespace-pre-wrap text-muted-foreground">
          {typedAnswer}
        </blockquote>
      ) : null}
      {answered ? null : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={disabled || pending}
            onClick={() => onSubmit(t`Skip this for now`)}
          >
            <Trans>Skip</Trans>
          </Button>
          <Button
            size="lg"
            disabled={disabled || pending || !value}
            onClick={() => onSubmit(value)}
          >
            {pending ? <Trans>Sending…</Trans> : <Trans>Submit</Trans>}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The options an answer chose: one by id, or several by their joined labels. */
export function answeredChoiceIds(answer: string, choices: readonly Choice[]): Set<string> {
  const byId = choices.find((choice) => choice.id === answer);
  if (byId) return new Set([byId.id]);
  const parts = new Set(answer.split(";").map((part) => part.trim()));
  const matched = choices.filter((choice) => parts.has(choice.label));
  // Only a full match of the joined labels counts; anything else is the person's own words.
  return matched.length > 0 && matched.length === parts.size
    ? new Set(matched.map((choice) => choice.id))
    : new Set();
}
