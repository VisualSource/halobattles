import type { ReactNode } from "react";
import type { ContentLookups } from "../content";
import type { Building } from "../gen/content";

// How buildings explain themselves: a role, the lines saying what one does
// on a Planet, and the info popover. All of it comes from content.

type Amounts = Record<string, number> | Map<string, number>;

/** "300 Credits · 100 Materials", leaving out zeros. */
export function amounts(content: ContentLookups, a: Amounts, scale = 1) {
  const entries = a instanceof Map ? [...a] : Object.entries(a);
  return entries
    .filter(([, n]) => n !== 0)
    .map(
      ([r, n]) =>
        `${Math.floor(n * scale)} ${content.resources.get(r)?.name ?? r}`,
    )
    .join(" · ");
}

/** Richness multiplies what a Planet's extractor buildings draw from it. */
export const RICHNESS: Record<string, number> = {
  none: 0,
  poor: 0.5,
  normal: 1,
  rich: 1.5,
};

export type Role =
  | "economy"
  | "production"
  | "research"
  | "lab"
  | "storage"
  | "defence"
  | "special";

const ICON = "fill-none stroke-current stroke-[1.5] [stroke-linejoin:round]";

/** Each role's name, colour and icon, in the build list's order. */
export const ROLES: Record<
  Role,
  { name: string; colour: string; icon: ReactNode }
> = {
  economy: {
    name: "Economy",
    colour: "var(--color-ok)",
    icon: <path d="M3 13l4-4 3 3 5-6M12 6h3v3" strokeLinecap="round" />,
  },
  production: {
    name: "Production",
    colour: "var(--color-accent)",
    icon: <path d="M2.5 15V8l4 2.5V8l4 2.5V4h5v11z" />,
  },
  research: {
    name: "Research",
    colour: "var(--color-res-research)",
    icon: <path d="M7 2h4M7.6 2v5L3 15.5h12L10.4 7V2" />,
  },
  lab: {
    name: "Lab",
    colour: "#c58cf0",
    icon: <path d="M3 3h12v12H3zM6 7h6M6 10h6M6 13h3" strokeLinecap="round" />,
  },
  storage: {
    name: "Storage",
    colour: "var(--color-idle)",
    icon: (
      <path d="M2.5 6 9 2.5 15.5 6v7L9 16.5 2.5 13zM2.5 6 9 9.5 15.5 6M9 9.5v7" />
    ),
  },
  defence: {
    name: "Defence",
    colour: "var(--color-danger)",
    icon: <path d="M9 1.8 15 4v4.6c0 3.6-2.5 6.3-6 7.6-3.5-1.3-6-4-6-7.6V4z" />,
  },
  special: {
    name: "Special",
    colour: "#e9a3d6",
    icon: <path d="M9 2l2 5h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5z" />,
  },
};

/** A building's role: what it's mainly for, the first of these it does. */
export function roleOf(b: Building): Role {
  if (b.trains?.length) return "production";
  if (b.techSlots) return "lab";
  if (Object.keys(b.research ?? {}).length) return "research";
  if (b.extracts || b.refines || Object.keys(b.yield).length) return "economy";
  if (b.storage) return "storage";
  if (b.combat) return "defence";
  return "special";
}

export function RoleIcon(props: { role: Role }) {
  const r = ROLES[props.role];
  return (
    <span
      aria-hidden="true"
      className="flex size-7.5 flex-none items-center justify-center rounded-md border"
      style={{
        color: r.colour,
        borderColor: `color-mix(in srgb, ${r.colour} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${r.colour} 14%, transparent)`,
      }}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={`size-4.5 ${ICON}`}
      >
        {r.icon}
      </svg>
    </span>
  );
}

/** One thing a building does: a line, and how it adds up, if that helps. */
export type Fact = { line: string; sub?: string };

/** What a building does on a Planet with this richness, in plain words. */
export function factsOf(
  content: ContentLookups,
  b: Building,
  richness: Map<string, string>,
): Fact[] {
  const name = (r: string) => content.resources.get(r)?.name ?? r;
  const facts: Fact[] = [];
  if (b.trains?.length)
    facts.push({
      line: `Trains ${b.trains.map((u) => content.units.get(u)?.name ?? u).join(", ")}`,
    });
  if (amounts(content, b.yield))
    facts.push({ line: `+${amounts(content, b.yield)} / Payday` });
  for (const [r, n] of Object.entries(b.extracts ?? {})) {
    const level = richness.get(r) ?? "none";
    const x = RICHNESS[level] ?? 0;
    facts.push({
      line: `+${Math.floor(n * x)} ${name(r)} / Payday here`,
      sub:
        level === "none"
          ? `No ${name(r)} deposit on this Planet`
          : `${n} × ${level} deposit (×${x})`,
    });
  }
  if (b.refines)
    facts.push({
      line: `${amounts(content, b.refines.input)} → ${amounts(content, b.refines.output)} / Payday`,
      sub: "Converts what there is, if short",
    });
  const pay = content.rules.paydaySeconds;
  for (const [f, n] of Object.entries(b.research ?? {}))
    facts.push({
      line: `+${n * pay} ${content.rules.tech.fields[f]?.name ?? f} Research / Payday`,
      sub: `${n} a second, wherever it's built`,
    });
  if (b.techSlots)
    facts.push({
      line: `Holds ${b.techSlots} Tech${b.techSlots > 1 ? "s" : ""}`,
    });
  if (b.storage)
    facts.push({
      line: `Stockpile caps +${Object.entries(b.storage)
        .map(([r, n]) => `${n} ${name(r)}`)
        .join(", +")}`,
    });
  if (b.combat) {
    const strong = Object.entries(b.combat.tiers ?? {})
      .filter(([, t]) => t === "advantage")
      .map(([c]) => content.unitClasses.get(c)?.name ?? c);
    const c = b.combat;
    facts.push({
      line: "Fights in Battles here",
      sub: [
        `${content.weaponTypes.get(c.weaponType)?.name ?? c.weaponType} ${c.damage}`,
        strong.length > 0 && `strong vs ${strong.join(", ")}`,
        [
          c.shield && `Shield ${c.shield}`,
          c.armor && `Armor ${c.armor}`,
          `HP ${c.hp}`,
        ]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (b.commandPointBonus)
    facts.push({ line: `+${b.commandPointBonus} Command Points` });
  const needs = [...content.techs.values()].filter(
    (t) =>
      t.requires?.buildings?.includes(b.id) &&
      (!t.faction || t.faction === b.faction),
  );
  if (needs.length)
    facts.push({
      line: `Needed to research ${needs.map((t) => t.name).join(", ")}`,
    });
  return facts;
}

/** A building's details, for its info popover. */
export function BuildingInfo(props: {
  content: ContentLookups;
  building: Building;
  richness: Map<string, string>;
  /** What it costs you to queue now. */
  cost: Record<string, number>;
  needs: string[];
}) {
  const { content, building: b } = props;
  const role = roleOf(b);
  const refund = content.rules.sellRefundPercent;
  const row =
    "contents [&>dt]:text-ink-4 [&>dt]:font-mono [&>dt]:text-[11px] [&>dt]:uppercase [&>dt]:tracking-[0.06em] [&>dt]:pt-px";
  return (
    <div className="flex w-72 flex-col gap-2">
      <div className="flex items-center gap-2">
        <RoleIcon role={role} />
        <span className="flex flex-col leading-tight">
          <span className="font-display text-base font-semibold">{b.name}</span>
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase"
            style={{ color: ROLES[role].colour }}
          >
            {ROLES[role].name}
          </span>
        </span>
      </div>
      {b.description && (
        <p className="text-ink-2 m-0 text-[12.5px]">{b.description}</p>
      )}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {factsOf(content, b, props.richness).map((f, i) => (
          <div key={f.line} className={row}>
            <dt>{i === 0 && "Does"}</dt>
            <dd className="m-0">
              {f.line}
              {f.sub && <span className="text-ink-3 block">{f.sub}</span>}
            </dd>
          </div>
        ))}
        <div className={row}>
          <dt>Cost</dt>
          <dd className="m-0 font-mono">
            {amounts(content, props.cost)} · {b.buildTime} s
          </dd>
        </div>
        <div className={row}>
          <dt>Upkeep</dt>
          <dd className="m-0 font-mono">
            {amounts(content, b.upkeep) ? (
              <span className="text-danger">
                {amounts(content, b.upkeep)} / Payday
              </span>
            ) : (
              <span className="text-ink-4">none</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt>Sell</dt>
          <dd className="text-ink-3 m-0 font-mono">refunds {refund}%</dd>
        </div>
      </dl>
      {props.needs.length > 0 && (
        <span className="text-accent text-xs">
          Needs the Tech {props.needs.join(" or ")}
        </span>
      )}
    </div>
  );
}
