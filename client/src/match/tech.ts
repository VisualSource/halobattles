import type { ContentLookups } from "../content";
import type { Effect, Tech } from "../gen/content";
import { fieldsOf } from "./fields";
import { arrival, type Lanes, type Owner } from "./route";
import type { Army, PlanetView, Project, View } from "./store";

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
 * hold none of them; empty when you may make it. A Unit Variant needs its
 * parent's first.
 */
export function needsTech(
  content: ContentLookups,
  held: Set<string>,
  kind: "units" | "buildings",
  id: string,
): string[] {
  const parent = kind === "units" && content.units.get(id)?.variantOf;
  const first = parent ? needsTech(content, held, "units", parent) : [];
  if (first.length) return first;
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
  couriers: string[]; // Tech ids of Couriers reserving a Tech Slot here
  free: number;
};

/**
 * The Couriers reserving a Tech Slot in a Lab, each once: incoming ones, going
 * back to it included, and those that left it for another. Only your own say
 * which Labs (a Spectator's View says for every player's).
 */
export function labCouriers(view: View, planet: string, slot: number) {
  const couriers = [...view.armies.values()].filter((a) => a.tech);
  const going = (a: Army) => a.destPlanet === planet && a.destSlot === slot;
  return {
    incoming: couriers.filter(going),
    outgoing: couriers.filter(
      (a) => a.homePlanet === planet && a.homeSlot === slot && !going(a),
    ),
  };
}

/**
 * What fills a Lab, Building Slot slot of p, and its free Tech Slots out of
 * the building's base count. Your View has only your own effects, and your
 * own Projects, so another player's Lab shows as built.
 */
export function labFill(
  content: ContentLookups,
  view: View,
  p: PlanetView,
  slot: number,
  base: number,
) {
  const own = p.owner === view.you;
  const holds = p.labs.get(slot) ?? [];
  const researching = own
    ? view.research.projects
        .filter((x) => x.planet === p.id && x.slot === slot)
        .map((x) => x.tech)
    : [];
  const { incoming, outgoing } = labCouriers(view, p.id, slot);
  const slots = own
    ? modded(content, heldTechs(view), "techSlots", base)
    : base;
  const free = Math.max(
    0,
    slots -
      holds.length -
      researching.length -
      incoming.length -
      outgoing.length,
  );
  return { holds, researching, incoming, outgoing, free };
}

/**
 * The Techs lost with a Lab: those it holds, and those on Couriers coming to
 * it with no other Lab to turn back to.
 */
export function techsLostWithLab(view: View, p: PlanetView, slot: number) {
  const stranded = labCouriers(view, p.id, slot).incoming.filter(
    (a) => !a.homePlanet || (a.homePlanet === p.id && a.homeSlot === slot),
  );
  return [...(p.labs.get(slot) ?? []), ...stranded.map((a) => a.tech)];
}

/** When a Courier lands, in words. One waiting has no time: it goes when its Planet unlocks. */
export function courierLanding(
  lanes: Lanes,
  a: Army,
  now: number,
  planetName: (id: string) => string,
  own?: number,
  owner?: Owner,
) {
  if (a.waiting) return `waiting in orbit at ${planetName(a.to)}`;
  return `arrives in ${Math.max(0, Math.ceil((arrival(lanes, a, now, own, owner) - now) / 1000))} s`;
}

/** The colour of a Tech's Rarity. */
export const rarityColour = (content: ContentLookups, tech: string) =>
  `var(--color-rarity-${content.techs.get(tech)?.rarity ?? "common"})`;

/** Your Labs, by Planet then slot, with what each holds and its free Tech Slots. */
export function labs(content: ContentLookups, view: View): Lab[] {
  const out: Lab[] = [];
  for (const p of [...view.planets.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (p.owner !== view.you) continue;
    p.buildings.forEach((id, slot) => {
      const b = content.buildings.get(id);
      if (!b?.techSlots) return;
      const { holds, researching, incoming, outgoing, free } = labFill(
        content,
        view,
        p,
        slot,
        b.techSlots,
      );
      out.push({
        planet: p.id,
        slot,
        name: b.name,
        holds,
        researching,
        couriers: [...incoming, ...outgoing].map((a) => a.tech),
        free,
      });
    });
  }
  return out;
}

/** Your Labs a Tech could go to: not the one it's in, nor those its Courier already reserves. */
export const otherLabs = (content: ContentLookups, view: View, tech: string) =>
  labs(content, view).filter(
    (l) => !l.holds.includes(tech) && !l.couriers.includes(tech),
  );

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

/** Whether a field has something to pick: a Tech in its hand, or a saved one. */
export const offered = (content: ContentLookups, view: View, field: string) =>
  (view.research.hands.get(field)?.length ?? 0) > 0 ||
  view.research.saved.some((v) => content.techs.get(v.tech)?.field === field);

/**
 * Your Faction's buildings that raise field's Research, when its Research is
 * what keeps all its remaining Techs from being offered; otherwise none. It
 * names them without saying how much is needed: the thresholds stay hidden.
 */
export function researchBuildings(
  content: ContentLookups,
  view: View,
  field: string,
): string[] {
  const rate = view.research.rates.get(field) ?? 0;
  const faction = view.players[view.you]?.faction;
  const held = heldTechs(view);
  const left = [...content.techs.entries()].filter(
    ([id, t]) =>
      t.field === field &&
      (!t.faction || t.faction === faction) &&
      !held.has(id),
  );
  const opened = (t: Tech) =>
    (content.rules.tech.rarities[t.rarity]?.from ?? 0) <= rate;
  if (left.length === 0 || left.some(([, t]) => opened(t))) return [];
  return [...content.buildings.values()]
    .filter((b) => b.faction === faction && (b.research?.[field] ?? 0) > 0)
    .map((b) => b.name);
}

/** Fields with no Project and something to pick: the idle ones worth a nudge. */
export const idleFields = (content: ContentLookups, view: View) =>
  fieldsOf(content).filter(
    (f) =>
      !view.research.projects.some(
        (p) => content.techs.get(p.tech)?.field === f.id,
      ) && offered(content, view, f.id),
  );

/**
 * The Projects in was that finished by now: gone from the list, their Tech
 * newly held. A cancelled one, or one whose Lab was lost, isn't held.
 */
export function finishedProjects(was: View, now: View): Project[] {
  const held = heldTechs(now);
  const heldBefore = heldTechs(was);
  return was.research.projects.filter(
    (p) =>
      held.has(p.tech) &&
      !heldBefore.has(p.tech) &&
      !now.research.projects.some((q) => q.tech === p.tech),
  );
}

/** Where a Tech stands for you, as the tech tree shows it. */
export type TreeStatus =
  | { kind: "held"; planets: string[] } // in a Lab on these Planets
  | { kind: "moving" } // on a Courier: it doesn't count until it lands
  | { kind: "researching"; project: Project }
  | { kind: "saved"; done: number; cost: number } // a stopped Project or lost Tech, guaranteed back
  | { kind: "hand" } // drawn: ready to start
  | { kind: "drawable" } // can come up in a hand
  | { kind: "locked"; needs: string[] }; // what's missing, in words

/** Your Faction's Techs and the shared ones, in a field, by id. */
export const treeTechs = (content: ContentLookups, view: View, field: string) =>
  [...content.techs.values()]
    .filter(
      (t) =>
        t.field === field &&
        (!t.faction || t.faction === view.players[view.you]?.faction),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

export function treeStatus(
  content: ContentLookups,
  view: View,
  id: string,
): TreeStatus {
  const r = view.research;
  const planets = [...view.planets.values()]
    .filter(
      (p) =>
        p.owner === view.you &&
        [...p.labs.values()].some((h) => h.includes(id)),
    )
    .map((p) => p.id);
  if (planets.length) return { kind: "held", planets };
  if (
    [...view.armies.values()].some((a) => a.tech === id && a.owner === view.you)
  )
    return { kind: "moving" };
  const project = r.projects.find((p) => p.tech === id);
  if (project) return { kind: "researching", project };
  const saved = r.saved.find((s) => s.tech === id);
  if (saved) return { kind: "saved", done: saved.done, cost: saved.cost };
  if ([...r.hands.values()].some((h) => h.includes(id)))
    return { kind: "hand" };
  const t = content.techs.get(id);
  if (!t) return { kind: "locked", needs: [] };
  const held = heldTechs(view);
  const owned = new Set(
    [...view.planets.values()]
      .filter((p) => p.owner === view.you)
      .flatMap((p) => p.buildings),
  );
  const needs = [
    ...(t.requires?.techs ?? [])
      .filter((x) => !held.has(x))
      .map((x) => content.techs.get(x)?.name ?? x),
    ...(t.requires?.buildings ?? [])
      .filter((b) => !owned.has(b))
      .map((b) => `a ${content.buildings.get(b)?.name ?? b}`),
  ];
  // Its Rarity opens once the field's Research reaches a threshold, kept hidden.
  const from = content.rules.tech.rarities[t.rarity]?.from ?? 0;
  if (from > (r.rates.get(t.field) ?? 0))
    needs.push(
      `more ${content.rules.tech.fields[t.field]?.name ?? t.field} Research`,
    );
  return needs.length ? { kind: "locked", needs } : { kind: "drawable" };
}

/**
 * Where each Tech goes in a field's tree, in columns (its depth) and rows: a
 * tidy tree, leaves taking rows in turn and a Tech centred on the Techs that
 * need it. A Tech needing two in the field sits under the first.
 */
export function treeLayout(techs: Tech[]) {
  const ids = new Set(techs.map((t) => t.id));
  const parentOf = (t: Tech) =>
    (t.requires?.techs ?? []).find((x) => ids.has(x));
  const kids = (id: string) => techs.filter((t) => parentOf(t) === id);
  const at = new Map<string, { col: number; row: number }>();
  let row = 0;
  const place = (t: Tech, col: number) => {
    if (at.has(t.id)) return;
    at.set(t.id, { col, row: -1 }); // reserved, so a loop can't recurse forever
    const ks = kids(t.id).filter((k) => !at.has(k.id));
    for (const k of ks) place(k, col + 1);
    const placed = ks.map((k) => at.get(k.id)?.row ?? 0);
    at.set(t.id, {
      col,
      row: placed.length
        ? (Math.min(...placed) + Math.max(...placed)) / 2
        : row++,
    });
  };
  for (const t of techs) if (!parentOf(t)) place(t, 0);
  for (const t of techs) place(t, 0); // anything caught in a loop
  return at;
}
