import type { ContentLookups } from "../content";
import type { Combat } from "../gen/content";
import type { PlanetView } from "./store";

export const THREAT_LEVELS = ["Low", "Medium", "High", "Very high"] as const;

/** A Damage roll's average: "2d6+1" is 8. */
const average = (dice: string) => {
  const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(dice);
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 + Number(m[3] ?? 0) : 0;
};

const strength = (c: Combat | undefined) =>
  c ? (c.shield + c.armor + c.hp) * average(c.damage) : 0;

/**
 * How well a Planet is defended: each unit and armed building scores
 * (Shield + Armor + HP) × its Damage roll's average, times its count. The
 * level, 0 (Low) to 3 (Very high), is how many of the Ruleset's
 * threatBands the score reaches; top is what scores most.
 */
export function threat(
  content: Pick<ContentLookups, "units" | "buildings" | "rules">,
  planet: Pick<PlanetView, "stacks" | "buildings">,
) {
  const parts = new Map<
    string,
    { name: string; count: number; score: number }
  >();
  const add = (id: string, name: string, count: number, each: number) => {
    if (!each) return;
    const p = parts.get(id) ?? { name, count: 0, score: 0 };
    p.count += count;
    p.score += each * count;
    parts.set(id, p);
  };
  for (const st of planet.stacks)
    for (const s of st) {
      const u = content.units.get(s.unit);
      if (u) add(s.unit, u.name, s.count, strength(u.combat));
    }
  for (const id of planet.buildings) {
    const b = content.buildings.get(id);
    if (b) add(id, b.name, 1, strength(b.combat));
  }
  let score = 0;
  let top: { name: string; count: number; score: number } | null = null;
  for (const p of parts.values()) {
    score += p.score;
    if (!top || p.score > top.score) top = p;
  }
  const level = content.rules.threatBands.filter((b) => score >= b).length;
  return { score, level, top };
}
