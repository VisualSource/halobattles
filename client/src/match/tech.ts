import type { ContentLookups } from "../content";
import type { Effect, Tech } from "../gen/content";
import type { Project, View } from "./store";

// Techs as the client shows them; docs/specs/tech-spec.md. The server
// decides; these mirror its rules so the UI can explain before it asks.

/** Your held Techs: those in the Labs on your Planets. */
export function heldTechs(view: View): Set<string> {
  const held = new Set<string>();
  for (const p of view.planets.values()) {
    if (p.owner !== view.you) continue;
    for (const techs of p.labs.values()) for (const t of techs) held.add(t);
  }
  return held;
}

/** v with the percentages added then applied, then the flat amounts, as the server rounds. */
function modded(
  content: ContentLookups,
  held: Set<string>,
  stat: Effect["stat"],
  v: number,
) {
  let percent = 0;
  let amount = 0;
  for (const id of held) {
    for (const e of content.techs.get(id)?.effects ?? []) {
      if (e.stat !== stat || e.unit || e.unitClass || e.resource) continue;
      percent += e.percent ?? 0;
      amount += e.amount ?? 0;
    }
  }
  return Math.floor((v * (100 + percent) + 50) / 100) + amount;
}

/** What a new Project for tech costs you now. */
export function techCost(
  content: ContentLookups,
  held: Set<string>,
  tech: string,
) {
  const base = content.techs.get(tech)?.cost ?? 0;
  const scaling = content.rules.tech.costScalingPercent;
  return Math.floor((base * (100 + held.size * scaling) + 50) / 100);
}

/**
 * The Techs that would unlock a unit or building, if one is needed and you
 * hold none of them; empty when you may make it.
 */
export function needsTech(
  content: ContentLookups,
  held: Set<string>,
  kind: "units" | "buildings",
  id: string,
): string[] {
  const by = [...content.techs.values()].filter((t) =>
    t.unlocks?.[kind]?.includes(id),
  );
  return by.some((t) => held.has(t.id)) ? [] : by.map((t) => t.name);
}

/** "A", "A and B", "A, B and C" */
export const listed = (xs: string[]) =>
  xs.length > 1
    ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`
    : (xs[0] ?? "");

const STATS: Record<Effect["stat"], [string, string]> = {
  shield: ["Shield", "Shield"],
  armor: ["Armor", "Armor"],
  hp: ["HP", "HP"],
  damage: ["damage", "damage"],
  extractorYield: ["extractor yields", "extractor yields"],
  upkeep: ["Upkeep", "Upkeep"],
  stockpileCap: ["Stockpile caps", "Stockpile caps"],
  buildTime: ["build time", "build time"],
  sprawlFreePlanets: ["Sprawl-free Planet", "Sprawl-free Planets"],
  commandPoints: ["Command Point", "Command Points"],
  techSlots: ["Tech Slot per Lab", "Tech Slots per Lab"],
  research: ["Research", "Research"],
};

/** One effect in words: "+10% Infantry HP", "+1 Tech Slot per Lab". */
export function effectText(content: ContentLookups, e: Effect) {
  const v = e.percent ?? e.amount ?? 0;
  const sign = v < 0 ? "−" : "+";
  const [one, many] = STATS[e.stat];
  const narrow =
    (e.unit && content.units.get(e.unit)?.name) ||
    (e.unitClass && content.unitClasses.get(e.unitClass)?.name) ||
    (e.resource && content.resources.get(e.resource)?.name) ||
    (e.field && content.rules.tech.fields[e.field]?.name);
  const what = e.percent === undefined && Math.abs(v) === 1 ? one : many;
  const every = e.stat === "research" && !e.field ? ", every field" : "";
  return `${sign}${Math.abs(v)}${e.percent === undefined ? "" : "%"} ${narrow ? `${narrow} ` : ""}${what}${every}`;
}

/** What a Tech does, in a line: its unlocks, then its effects. */
export function techText(content: ContentLookups, t: Tech) {
  const unlocked = [
    ...(t.unlocks?.buildings ?? []).map(
      (id) => content.buildings.get(id)?.name ?? id,
    ),
    ...(t.unlocks?.units ?? []).map((id) => content.units.get(id)?.name ?? id),
  ];
  return [
    unlocked.length ? `Unlocks ${listed(unlocked.map((n) => `the ${n}`))}` : "",
    ...(t.effects ?? []).map((e) => effectText(content, e)),
  ]
    .filter(Boolean)
    .join("; ");
}

export type Lab = {
  planet: string;
  slot: number; // its Building Slot
  name: string; // the building's
  holds: string[]; // Tech ids
  researching: string[]; // Tech ids of Projects reserving a Tech Slot here
  free: number;
};

/** Your Labs, by Planet then slot, with what each holds and its free Tech Slots. */
export function labs(content: ContentLookups, view: View): Lab[] {
  const held = heldTechs(view);
  const out: Lab[] = [];
  for (const p of [...view.planets.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (p.owner !== view.you) continue;
    p.buildings.forEach((id, slot) => {
      const b = content.buildings.get(id);
      if (!b?.techSlots) return;
      const holds = p.labs.get(slot) ?? [];
      const researching = view.research.projects
        .filter((x) => x.planet === p.id && x.slot === slot)
        .map((x) => x.tech);
      const slots = modded(content, held, "techSlots", b.techSlots);
      out.push({
        planet: p.id,
        slot,
        name: b.name,
        holds,
        researching,
        free: Math.max(0, slots - holds.length - researching.length),
      });
    });
  }
  return out;
}

/** Why a Project isn't progressing, or null while it runs. */
export function pauseReason(
  content: ContentLookups,
  view: View,
  p: Project,
  planetName: (id: string) => string,
) {
  if (p.rate > 0) return null;
  if (view.planets.get(p.planet)?.locked)
    return `Paused: ${planetName(p.planet)} is Locked`;
  const owned = new Set(
    [...view.planets.values()]
      .filter((x) => x.owner === view.you)
      .flatMap((x) => x.buildings),
  );
  const missing = (content.techs.get(p.tech)?.requires?.buildings ?? []).find(
    (b) => !owned.has(b),
  );
  if (missing)
    return `Paused: needs a ${content.buildings.get(missing)?.name ?? missing}`;
  return "Starting…";
}
