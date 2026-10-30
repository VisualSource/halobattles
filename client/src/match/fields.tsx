import type { ContentLookups } from "../content";

// shortcut: only the base Mod's assets are bundled, so another Mod's field icon shows as a dot; load Mod assets from the server when a second Mod ships some.
const BASE = "../../../mods/base/assets/";
const baseAssets = import.meta.glob("../../../mods/base/assets/**/*", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The URL of an asset reference, `__base__/icons/x.svg`, if it's bundled. */
const assetUrl = (ref?: string) =>
  ref?.startsWith("__base__/")
    ? baseAssets[BASE + ref.slice("__base__/".length)]
    : undefined;

/** The Ruleset's Research fields, by their order, then by id. */
export const fieldsOf = (content: Pick<ContentLookups, "rules">) =>
  Object.entries(content.rules.tech.fields)
    .sort(
      ([a, x], [b, y]) => (x.order ?? 0) - (y.order ?? 0) || a.localeCompare(b),
    )
    .map(([id, f]) => ({ id, ...f }));

/** A Research field's icon, tinted its colour; a dot in its colour without one. */
export function FieldIcon(props: { content: ContentLookups; field: string }) {
  const f = props.content.rules.tech.fields[props.field];
  const url = assetUrl(f?.icon);
  return (
    <span
      aria-hidden="true"
      className={`inline-block flex-none ${url ? "size-4.5" : "size-2 rounded-full"}`}
      style={{
        backgroundColor: f?.colour ?? "var(--color-ink-3)",
        ...(url && { mask: `url(${url}) center / contain no-repeat` }),
      }}
    />
  );
}
