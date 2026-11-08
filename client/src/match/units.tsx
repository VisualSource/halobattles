import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { amounts } from "./buildings";
import { CommandPoints } from "./resources";
import { average } from "./threat";

// How units explain themselves in the Units tab's info popover. All of it
// comes from content.

const TIERS = {
  counter: { label: "Counters", text: "text-ok font-semibold" },
  advantage: { label: "Strong vs", text: "text-ok" },
  normal: { label: "Normal vs", text: "text-ink-2" },
  disadvantage: { label: "Weak vs", text: "text-danger" },
  none: { label: "Can't hit", text: "text-ink-4" },
} as const;

/** Whether units can Raid: every one with one of the Ruleset's raidRoles, within its raidCap. */
export function canRaid(
  content: ContentLookups,
  units: { unit: string; count: number }[],
) {
  let cp = 0;
  for (const u of units) {
    const def = content.units.get(u.unit);
    const raiders: string[] = content.rules.battle.raidRoles;
    if (!def?.roles?.some((r) => raiders.includes(r))) return false;
    cp += def.commandPoints * u.count;
  }
  return cp <= content.rules.battle.raidCap;
}

/** How a unit fares against each Unit Class, in content's order; a class
 * its tiers leave out is normal. */
export function matchups(content: ContentLookups, combat: Unit["combat"]) {
  const tiers = combat.tiers ?? {};
  return [...content.unitClasses].map(([id, c]) => ({
    name: c.name,
    tier: (tiers[id] ?? "normal") as keyof typeof TIERS,
  }));
}

/** What a unit can do beyond fighting, from its roles and carry. */
export function roleTags(content: ContentLookups, u: Unit) {
  const roles: string[] = u.roles ?? [];
  const raiders: string[] = content.rules.battle.raidRoles;
  return [
    roles.includes("scout") && "Scout",
    roles.some((r) => raiders.includes(r)) && "Can Raid",
    roles.includes("aa") && "Anti-air: fires on Dropships",
    u.carry && `Dropship: carries ${u.carry} Command Points`,
  ].filter((t): t is string => !!t);
}

/** A weapon type's multipliers in words: above ×1 is strong against that layer, below is weak. */
export function weaponWords(content: ContentLookups, weaponType: string) {
  const w = content.weaponTypes.get(weaponType);
  const layers = [
    ["shields", w?.shield ?? 1],
    ["armour", w?.armor ?? 1],
    ["HP", w?.hp ?? 1],
  ] as const;
  const of = (keep: (m: number) => boolean) =>
    layers.filter(([, m]) => keep(m)).map(([name]) => name);
  return {
    name: w?.name ?? weaponType,
    strong: of((m) => m > 1),
    weak: of((m) => m < 1),
  };
}

/** Matchups and weapon in words: what a fighter is strong and weak against. */
export function Fights(props: {
  content: ContentLookups;
  combat: Unit["combat"];
}) {
  const { content, combat } = props;
  const byTier = (tier: keyof typeof TIERS) =>
    matchups(content, combat)
      .filter((x) => x.tier === tier)
      .map((x) => x.name);
  const w = weaponWords(content, combat.weaponType);
  const weapon = [
    w.strong.length > 0 && `strong vs ${w.strong.join(", ")}`,
    w.weak.length > 0 && `weak vs ${w.weak.join(", ")}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {(["counter", "advantage", "disadvantage", "none"] as const).map(
        (tier) =>
          byTier(tier).length > 0 && (
            <span key={tier}>
              <span className={TIERS[tier].text}>{TIERS[tier].label}</span>{" "}
              {byTier(tier).join(", ")}
            </span>
          ),
      )}
      <span className="text-ink-3">
        {w.name}
        {weapon.length > 0
          ? `: ${weapon.join(", ")}`
          : ": even against every layer"}
      </span>
    </div>
  );
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
      {u.tactics && <p className="text-ink m-0 text-[12.5px]">{u.tactics}</p>}
      {roleTags(content, u).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {roleTags(content, u).map((t) => (
            <span
              key={t}
              className="border-edge text-ink-2 rounded-full border px-1.75 py-px text-[11.5px]"
            >
              {t}
            </span>
          ))}
        </div>
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
      <Fights content={content} combat={c} />
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
