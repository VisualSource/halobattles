import type { ReactNode } from "react";
import type { ContentLookups } from "../content";

// shortcut: the base Mod's Resources drawn here, since Mods can't ship assets
// yet; once they can, draw a Resource's own `icon` instead.
const resourceGlyphs: Record<string, ReactNode> = {
  "base:credits": (
    <>
      <circle cx="9" cy="9" r="7.5" fill="var(--color-res-credits)" />
      <circle
        cx="9"
        cy="9"
        r="4.5"
        fill="none"
        stroke="var(--color-bar)"
        strokeWidth="1.5"
      />
    </>
  ),
  "base:materials": (
    <>
      <path
        d="M9 1.5 15.5 6v6L9 16.5 2.5 12V6z"
        fill="var(--color-res-materials)"
      />
      <path
        d="M2.5 6 9 9l6.5-3M9 9v7.5"
        fill="none"
        stroke="var(--color-bar)"
        strokeWidth="1.2"
      />
    </>
  ),
  "base:alloys": (
    <>
      <path d="M4 8.5 6 4h6l2 4.5z" fill="var(--color-res-alloys)" />
      <path d="M1.5 15 3.5 10h11l2 5z" fill="var(--color-res-alloys)" />
    </>
  ),
};

/** A Resource's icon; one without its own shows its initial. */
export function ResourceIcon(props: {
  id: string;
  name: string;
  size?: number;
}) {
  const size = props.size ?? 18;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      {resourceGlyphs[props.id] ?? (
        <>
          <circle cx="9" cy="9" r="7.5" fill="var(--color-ink-3)" />
          <text
            x="9"
            y="12.5"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--color-bar)"
          >
            {props.name[0]}
          </text>
        </>
      )}
    </svg>
  );
}

/** A cost as icons and amounts, "[icon] 150 [icon] 50", leaving out zeros;
 * each icon is named for screen readers. */
export function CostIcons(props: {
  content: ContentLookups;
  cost: Record<string, number>;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {Object.entries(props.cost)
        .filter(([, n]) => n !== 0)
        .map(([r, n]) => {
          const name = props.content.resources.get(r)?.name ?? r;
          return (
            <span
              key={r}
              className="inline-flex items-center gap-0.5"
              title={name}
            >
              <ResourceIcon id={r} name={name} size={props.size ?? 12} />
              <span className="sr-only">{name}</span>
              {n}
            </span>
          );
        })}
    </span>
  );
}
