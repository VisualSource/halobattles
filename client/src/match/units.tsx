import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { amounts } from "./buildings";
import { CommandPoints } from "./resources";
import { average } from "./threat";

// How units explain themselves in the Units tab's info popover. All of it
// comes from content.

const TIERS = {
  advantage: { label: "Strong vs", chip: "border-ok-edge bg-ok-wash text-ok" },
  normal: { label: "Normal vs", chip: "border-edge text-ink-2" },
  disadvantage: {
    label: "Weak vs",
    chip: "border-danger/40 bg-danger-wash text-danger",
  },
  none: { label: "Can't hit", chip: "border-edge text-ink-4 line-through" },
} as const;

/** How a unit fares against each Unit Class, in content's order; a class
 * its tiers leave out is normal. */
export function matchups(content: ContentLookups, u: Unit) {
  const tiers = u.combat.tiers ?? {};
  return [...content.unitClasses].map(([id, c]) => ({
    name: c.name,
    tier: (tiers[id] ?? "normal") as keyof typeof TIERS,
  }));
}

/** A unit's range, speed, Sight and fire interval: its own, else its Unit
 * Class's defaults from the Ruleset. */
export function moves(content: ContentLookups, u: Unit) {
  const c = u.combat;
  const d = content.rules.battle.classDefaults[c.unitClass];
  return {
    range: c.range ?? d?.range ?? 0,
    speed: c.speed ?? d?.speed ?? 0,
    sight: c.sight ?? d?.sight ?? 0,
    fireInterval: c.fireInterval ?? d?.fireInterval ?? 0,
  };
}

/** The most of each stat any unit in content has: a full bar. */
export function rosterMax(content: ContentLookups) {
  const max = { tough: 1, damage: 1, range: 1, speed: 1, sight: 1 };
  for (const u of content.units.values()) {
    const c = u.combat;
    const m = moves(content, u);
    max.tough = Math.max(max.tough, c.shield + c.armor + c.hp);
    max.damage = Math.max(max.damage, average(c.damage));
    max.range = Math.max(max.range, m.range);
    max.speed = Math.max(max.speed, m.speed);
    max.sight = Math.max(max.sight, m.sight);
  }
  return max;
}

const share = (v: number, max: number) => `${(100 * v) / max}%`;

function Meter(props: {
  label: string;
  value: number;
  max: number;
  shown?: string;
  colour: string;
}) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-2 text-xs">
      <span className="text-ink-3">{props.label}</span>
      <span className="bg-well h-1.5 overflow-hidden rounded-full">
        <span
          className={`block h-full rounded-full ${props.colour}`}
          style={{ width: share(props.value, props.max) }}
        />
      </span>
      <span className="text-ink-2 text-right font-mono text-[11.5px]">
        {props.shown ?? props.value}
      </span>
    </div>
  );
}

export function UnitInfo(props: {
  content: ContentLookups;
  unit: Unit;
  /** What it costs you to queue now. */
  cost: Record<string, number>;
  needs: string[];
}) {
  const { content, unit: u } = props;
  const c = u.combat;
  const m = moves(content, u);
  const name = (map: "unitClasses" | "weaponTypes", id: string) =>
    content[map].get(id)?.name ?? id;
  const row =
    "contents [&>dt]:text-ink-4 [&>dt]:font-mono [&>dt]:text-[11px] [&>dt]:uppercase [&>dt]:tracking-[0.06em] [&>dt]:pt-px";
  const max = rosterMax(content);
  const tough = c.shield + c.armor + c.hp;
  const layers = [
    { name: "Shield", value: c.shield, colour: "bg-res-research" },
    { name: "Armor", value: c.armor, colour: "bg-ink-3" },
    { name: "HP", value: c.hp, colour: "bg-ok" },
  ].filter((l) => l.value > 0);
  return (
    <div className="flex w-72 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex flex-col leading-tight">
          <span className="font-display text-base font-semibold">{u.name}</span>
          <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
            {name("unitClasses", c.unitClass)} ·{" "}
            {name("weaponTypes", c.weaponType)}
          </span>
        </span>
      </div>
      {u.description && (
        <p className="text-ink-2 m-0 text-[12.5px]">{u.description}</p>
      )}
      {/* Bars are scaled to the most any unit in content has. */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-ink-4 font-mono text-[11px] tracking-[0.06em] uppercase">
            Toughness
          </span>
          <span className="text-ink-2 font-mono text-xs">{tough}</span>
        </div>
        <div
          className="bg-well flex h-3 min-w-3 overflow-hidden rounded-sm"
          style={{ width: share(tough, max.tough) }}
        >
          {layers.map((l) => (
            <span
              key={l.name}
              className={l.colour}
              style={{ width: share(l.value, tough) }}
            />
          ))}
        </div>
        <div className="text-ink-3 flex gap-2.5 font-mono text-[11px]">
          {layers.map((l) => (
            <span key={l.name} className="flex items-center gap-1">
              <span className={`size-2 rounded-xs ${l.colour}`} />
              {l.name} {l.value}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Meter
          label="Damage"
          value={average(c.damage)}
          max={max.damage}
          shown={c.damage}
          colour="bg-accent"
        />
        <Meter
          label="Range"
          value={m.range}
          max={max.range}
          colour="bg-ink-3"
        />
        <Meter
          label="Speed"
          value={m.speed}
          max={max.speed}
          colour="bg-ink-3"
        />
        <Meter
          label="Sight"
          value={m.sight}
          max={max.sight}
          colour="bg-ink-3"
        />
        <span className="text-ink-3 text-[11.5px]">
          {name("weaponTypes", c.weaponType)}, a volley every {m.fireInterval} s
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {matchups(content, u).map((x) => (
          <span
            key={x.name}
            title={`${TIERS[x.tier].label} ${x.name}`}
            className={`rounded-full border px-1.75 py-px text-[11.5px] ${TIERS[x.tier].chip}`}
          >
            {x.name}
          </span>
        ))}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <div className={row}>
          <dt>Cost</dt>
          <dd className="m-0 font-mono">
            {amounts(content, props.cost)} · {u.buildTime} s
          </dd>
        </div>
        <div className={row}>
          <dt>Upkeep</dt>
          <dd className="m-0 font-mono">
            {amounts(content, u.upkeep ?? {}) ? (
              <span className="text-danger">
                {amounts(content, u.upkeep ?? {})} / Payday
              </span>
            ) : (
              <span className="text-ink-4">none</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt>Command</dt>
          <dd className="m-0 font-mono">
            <CommandPoints n={u.commandPoints} size={13} />
          </dd>
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
