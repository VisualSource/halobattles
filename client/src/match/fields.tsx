import { cn } from "cn";
import { assetUrl } from "../assets";
import type { ContentLookups } from "../content";

/** The Ruleset's Research fields, by their order, then by id. */
export const fieldsOf = (content: Pick<ContentLookups, "rules">) =>
  Object.entries(content.rules.tech.fields)
    .sort(
      ([a, x], [b, y]) => (x.order ?? 0) - (y.order ?? 0) || a.localeCompare(b),
    )
    .map(([id, f]) => ({ id, ...f }));

/** A Research field's icon, tinted its colour; a dot in its colour without one. */
export function FieldIcon(props: {
  content: ContentLookups;
  field: string;
  /** The icon's size; 4.5 by default. */
  size?: string;
}) {
  const f = props.content.rules.tech.fields[props.field];
  const url = assetUrl(f?.icon);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block flex-none",
        url ? (props.size ?? "size-4.5") : "size-2 rounded-full",
      )}
      style={{
        backgroundColor: f?.colour ?? "var(--color-ink-3)",
        // Quoted: an inlined SVG's data URL has quotes, which break an unquoted url().
        ...(url && {
          mask: `url("${url}") center / contain no-repeat`,
          WebkitMask: `url("${url}") center / contain no-repeat`,
        }),
      }}
    />
  );
}
