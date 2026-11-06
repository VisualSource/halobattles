import { cn } from "cn";
import type { ReactNode } from "react";
import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { average } from "../match/threat";
import { UnitInfo } from "../match/units";
import { UnitCard } from "../match/windows";
import { MultiSelect } from "../ui/select";
import {
  Choice,
  type Content,
  ContentPage,
  Field,
  input,
  label,
  Num,
  Reset,
  Section,
  type Write,
} from "./content";
import { overridden, overrides, resetAt, resolved } from "./variant";

// The Units page: every field of unit.schema.json, the buildings that train
// it, and the game's own card and info panel as a live preview. A Unit
// Variant is edited merged over its parent; Save writes only what differs.

type Raw = Record<string, unknown>;
/** A unit as the form edits it: with the buildings ticked in Trained at, by file, once changed. */
type Draft = Unit & { _trainedAt?: string[] };
const TIERS = [
  { id: "advantage", name: "Strong", className: "bg-ok-wash text-ok" },
  { id: "normal", name: "Normal" },
  { id: "disadvantage", name: "Weak", className: "bg-danger-wash text-danger" },
  { id: "none", name: "Can't hit", className: "bg-raised text-ink-3" },
] as const;
type Role = NonNullable<Unit["roles"]>[number];
const ROLES: { value: Role; label: string }[] = [
  { value: "scout", label: "Scout" },
  { value: "skirmisher", label: "Skirmisher" },
  { value: "infiltration", label: "Infiltration" },
  { value: "shock", label: "Shock" },
  { value: "aa", label: "Anti-air" },
];
const DICE = /^[1-9][0-9]*d[1-9][0-9]*(\+[0-9]+)?$/;

const blank = (): Unit => ({
  id: "",
  name: "",
  faction: "",
  cost: {},
  buildTime: 30,
  commandPoints: 1,
  combat: {
    unitClass: "infantry",
    weaponType: "kinetic",
    shield: 0,
    armor: 0,
    hp: 10,
    damage: "1d4",
  },
});

/** A map by id of one kind's values. */
const byId = (items: { value: Raw }[]) =>
  new Map(items.map((i) => [String(i.value.id), i.value]));

/**
 * The bits of ContentLookups the game's unit card and panel read, from the
 * raw files: Resources get their Mod's prefix, as the game's icons expect.
 */
function lookups(data: Content, draft: Unit): ContentLookups {
  const units = byId(data.units);
  units.set(draft.id, draft as unknown as Raw);
  const rules = (data.rulesets[0]?.value ?? {}) as {
    battle?: { classDefaults?: object };
  };
  return {
    units,
    unitClasses: byId(data.unitClasses),
    weaponTypes: byId(data.weaponTypes),
    resources: new Map(data.resources.map((r) => [`base:${r.id}`, r])),
    rules: { battle: { classDefaults: rules.battle?.classDefaults ?? {} } },
  } as unknown as ContentLookups;
}
const prefixed = (m: Record<string, number> = {}) =>
  Object.fromEntries(Object.entries(m).map(([k, n]) => [`base:${k}`, n]));

/** Resource amounts, one row per Resource; blank leaves one out. */
function Amounts(props: {
  data: Content;
  value: Record<string, number> | undefined;
  onChange: (v: Record<string, number>) => void;
}) {
  const rs = [...props.data.resources].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  return (
    <span className="grid grid-cols-[5.5rem_auto] items-center gap-1.5">
      {rs.map((r) => (
        <Row key={r.id} name={r.name}>
          <Num
            optional
            min={0}
            placeholder="0"
            value={props.value?.[r.id]}
            onChange={(n) => {
              const next = { ...props.value };
              if (n === undefined || n === 0) delete next[r.id];
              else next[r.id] = n;
              props.onChange(next);
            }}
          />
        </Row>
      ))}
    </span>
  );
}
/** Whether id is root or one of root's variants, at any depth. */
function isBelow(units: Map<string, Raw>, id: string, root: string) {
  for (let at: unknown = id, n = 0; typeof at === "string" && n < 64; n++) {
    if (at === root) return true;
    at = units.get(at)?.variantOf;
  }
  return false;
}
const Row = (props: {
  name: string;
  reset?: () => void;
  children: ReactNode;
}) => (
  <>
    <span className="text-ink-2 flex items-center gap-1 text-[13px]">
      {props.name}
      {props.reset && <Reset onClick={props.reset} />}
    </span>
    {props.children}
  </>
);

/** The building files whose trains lists name it now. */
const trainedAtIn = (data: Content, id: string) =>
  data.buildings
    .filter(
      (b) =>
        id && ((b.value.trains as string[] | undefined) ?? []).includes(id),
    )
    .map((b) => b.file);

/**
 * The files a save of u writes: its own (only what differs from its parent,
 * for a Unit Variant), then each building whose trains list changes. One
 * that isn't trainable comes off every list, as the loader requires.
 */
export function unitWrites(
  data: Content,
  { _trainedAt, ...u }: Draft,
  file: string,
): Write[] {
  const raw = byId(data.units);
  const parent =
    u.variantOf && raw.has(u.variantOf) && resolved(raw, u.variantOf);
  const at =
    u.trainable === false ? [] : (_trainedAt ?? trainedAtIn(data, u.id));
  return [
    { kind: "units", file, value: parent ? overrides(u as never, parent) : u },
    ...data.buildings.flatMap((b): Write[] => {
      const list = (b.value.trains as string[] | undefined) ?? [];
      const want = at.includes(b.file);
      if (want === list.includes(u.id)) return [];
      return [
        {
          kind: "buildings",
          file: b.file,
          path: ["trains"],
          value: want ? [...list, u.id] : list.filter((x) => x !== u.id),
        },
      ];
    }),
  ];
}

export function UnitsPage(props: {
  tabs: ReactNode;
  data: Content;
  reload: () => Promise<void>;
}) {
  const { data } = props;
  const raw = byId(data.units);
  /** Its parent, merged over its own parents, if it's a Unit Variant. */
  const parentOf = (u: Unit) =>
    u.variantOf && raw.has(u.variantOf)
      ? (resolved(raw, u.variantOf) as unknown as Unit)
      : undefined;
  /** Its parents' names then its own, so a variant sorts after its parent. */
  const chain = (id: string, seen: string[] = []): string[] => {
    const u = raw.get(id);
    const p = u?.variantOf;
    const own = String(u?.name ?? id);
    return typeof p === "string" && raw.has(p) && !seen.includes(id)
      ? [...chain(p, [...seen, id]), own]
      : [own];
  };
  const nameOf = (items: { value: Raw }[], id: string) =>
    String(byId(items).get(id)?.name ?? id);
  const defaults = (cls: string) =>
    ((data.rulesets[0]?.value as { battle?: { classDefaults?: Raw } })?.battle
      ?.classDefaults?.[cls] ?? {}) as Partial<Record<string, number>>;
  const trainedAt = (id: string) => trainedAtIn(data, id);
  const trainers = (faction: string) =>
    data.buildings.filter(
      (b) => b.value.faction === faction && Array.isArray(b.value.trains),
    );

  return (
    <ContentPage<Draft>
      tabs={props.tabs}
      noun="unit"
      items={data.units.map((i) => ({
        file: i.file,
        value: resolved(raw, String(i.value.id)) as unknown as Draft,
      }))}
      blank={blank}
      group={(u) => nameOf(data.factions, u.faction)}
      sub={(u) => u.combat?.unitClass ?? ""}
      order={(u) => chain(u.id).join("\u0000")}
      indent={(u) => chain(u.id).length - 1}
      onSaved={props.reload}
      // The unit's file, then each building whose trains list it changes.
      writes={(u, file) => unitWrites(data, u, file)}
      form={(u, set) => {
        const c = u.combat;
        const setC = (f: (c: Unit["combat"]) => Unit["combat"]) =>
          set((x) => ({ ...x, combat: f(x.combat) }));
        const d = defaults(c.unitClass);
        const parent = parentOf(u);
        /** A field's name, marked when it overrides the parent, with a reset. */
        const inh = (name: string, path: string[]) => {
          if (!parent || !overridden(u as never, parent as never, path))
            return { name };
          return {
            name: `${name} ●`,
            reset: () => set((x) => resetAt(x, parent as never, path)),
          };
        };
        const rolesField = inh("Roles", ["roles"]);
        return (
          <>
            <Section title="Unit">
              <div className="flex flex-wrap gap-3">
                <Field name="Id">
                  <input
                    className={`${input} w-36 font-mono`}
                    value={u.id}
                    pattern="[a-z0-9_\-]+"
                    onChange={(e) => set((x) => ({ ...x, id: e.target.value }))}
                  />
                </Field>
                <Field name="Name">
                  <input
                    className={`${input} w-44`}
                    value={u.name}
                    onChange={(e) =>
                      set((x) => ({ ...x, name: e.target.value }))
                    }
                  />
                </Field>
                <Field name="Variant of" hint="none: a unit of its own">
                  <select
                    className={input}
                    value={u.variantOf ?? ""}
                    onChange={(e) => {
                      const p = e.target.value;
                      set(({ variantOf: _, ...x }) =>
                        p
                          ? {
                              ...(resolved(raw, p) as unknown as Unit),
                              id: x.id,
                              name: x.name,
                              variantOf: p,
                            }
                          : x,
                      );
                    }}
                  >
                    <option value="">(none)</option>
                    {data.units
                      .map((x) => String(x.value.id))
                      // Not itself, nor one of its own variants: no cycles.
                      .filter((id) => !isBelow(raw, id, u.id))
                      .map((id) => (
                        <option key={id} value={id}>
                          {chain(id).join(" › ")}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  name="Faction"
                  hint={parent ? "from its parent" : undefined}
                >
                  <select
                    className={input}
                    disabled={!!parent}
                    value={u.faction}
                    onChange={(e) =>
                      set((x) => ({ ...x, faction: e.target.value }))
                    }
                  >
                    <option value="">(pick one)</option>
                    {data.factions.map((f) => (
                      <option key={f.file} value={String(f.value.id)}>
                        {String(f.value.name)}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex flex-col gap-0.5">
                  <span className={cn(label, "flex items-center gap-1")}>
                    {rolesField.name}
                    {rolesField.reset && <Reset onClick={rolesField.reset} />}
                  </span>
                  <MultiSelect
                    label="Roles"
                    className="w-56"
                    none="None"
                    options={ROLES}
                    value={u.roles ?? []}
                    onChange={(picked) =>
                      set(({ roles: _, ...x }) =>
                        picked.length ? { ...x, roles: picked } : x,
                      )
                    }
                  />
                </div>
              </div>
              <Field {...inh("Description", ["description"])}>
                <textarea
                  className={`${input} min-h-14`}
                  value={u.description ?? ""}
                  onChange={(e) =>
                    set((x) => ({
                      ...x,
                      description: e.target.value || undefined,
                    }))
                  }
                />
              </Field>
              <Field {...inh("Tactics", ["tactics"])}>
                <textarea
                  className={`${input} min-h-14`}
                  value={u.tactics ?? ""}
                  placeholder="How to use it: what it's for and what to keep it away from"
                  onChange={(e) =>
                    set((x) => ({
                      ...x,
                      tactics: e.target.value || undefined,
                    }))
                  }
                />
              </Field>
            </Section>
            <Section title="Training">
              <div className="flex flex-wrap gap-8">
                <Field {...inh("Cost", ["cost"])}>
                  <Amounts
                    data={data}
                    value={u.cost}
                    onChange={(cost) => set((x) => ({ ...x, cost }))}
                  />
                </Field>
                <Field {...inh("Upkeep / Payday", ["upkeep"])}>
                  <Amounts
                    data={data}
                    value={u.upkeep}
                    onChange={(up) =>
                      set((x) => ({
                        ...x,
                        upkeep: Object.keys(up).length ? up : undefined,
                      }))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 content-start gap-3">
                  <Field {...inh("Build s", ["buildTime"])}>
                    <Num
                      min={1}
                      value={u.buildTime}
                      onChange={(n) =>
                        set((x) => ({ ...x, buildTime: n ?? 1 }))
                      }
                    />
                  </Field>
                  <Field {...inh("Command", ["commandPoints"])}>
                    <Num
                      min={0}
                      value={u.commandPoints}
                      onChange={(n) =>
                        set((x) => ({ ...x, commandPoints: n ?? 0 }))
                      }
                    />
                  </Field>
                  <Field {...inh("Max count", ["maxCount"])}>
                    <Num
                      optional
                      min={1}
                      placeholder="none"
                      value={u.maxCount}
                      onChange={(n) => set((x) => ({ ...x, maxCount: n }))}
                    />
                  </Field>
                  <Field {...inh("Slot limit", ["slotLimit"])}>
                    <Num
                      optional
                      min={1}
                      placeholder="none"
                      value={u.slotLimit}
                      onChange={(n) => set((x) => ({ ...x, slotLimit: n }))}
                    />
                  </Field>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className={label}>Trained at</span>
                <span className="flex flex-wrap gap-3">
                  {trainers(u.faction).map((b) => {
                    const at = u._trainedAt ?? trainedAt(u.id);
                    return (
                      <label
                        key={b.file}
                        className="flex items-center gap-1.5 text-[13px]"
                      >
                        <input
                          type="checkbox"
                          disabled={u.trainable === false}
                          checked={at.includes(b.file)}
                          onChange={(e) =>
                            set((x) => ({
                              ...x,
                              _trainedAt: e.target.checked
                                ? [...at, b.file]
                                : at.filter((f) => f !== b.file),
                            }))
                          }
                        />
                        {String(b.value.name)}
                      </label>
                    );
                  })}
                  {trainers(u.faction).length === 0 && (
                    <span className="text-ink-4 text-[13px]">
                      Pick a Faction with production buildings.
                    </span>
                  )}
                </span>
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={u.trainable !== false}
                    onChange={(e) =>
                      set(({ trainable: _, ...x }) =>
                        e.target.checked ? x : { ...x, trainable: false },
                      )
                    }
                  />
                  Trainable{" "}
                  <span className="text-ink-4 text-[11px]">
                    off: a garrison or Starting Kit unit, trained nowhere
                  </span>
                </label>
                <span className="text-ink-4 text-[11px]">
                  {parent ? `Also trained wherever ${parent.name} is. ` : ""}
                  Saving edits each building's trains list.
                </span>
              </div>
            </Section>
            <Section title="Combat">
              <div className="flex flex-wrap gap-3">
                <Field {...inh("Unit Class", ["combat", "unitClass"])}>
                  <select
                    className={input}
                    value={c.unitClass}
                    onChange={(e) =>
                      setC((x) => ({ ...x, unitClass: e.target.value }))
                    }
                  >
                    {data.unitClasses.map((k) => (
                      <option key={k.file} value={String(k.value.id)}>
                        {String(k.value.name)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field {...inh("Weapon", ["combat", "weaponType"])}>
                  <select
                    className={input}
                    value={c.weaponType}
                    onChange={(e) =>
                      setC((x) => ({ ...x, weaponType: e.target.value }))
                    }
                  >
                    {data.weaponTypes.map((w) => (
                      <option key={w.file} value={String(w.value.id)}>
                        {String(w.value.name)}
                      </option>
                    ))}
                  </select>
                </Field>
                {(["shield", "armor", "hp"] as const).map((k) => (
                  <Field key={k} {...inh(k === "hp" ? "HP" : k, ["combat", k])}>
                    <Num
                      min={k === "hp" ? 1 : 0}
                      value={c[k]}
                      onChange={(n) => setC((x) => ({ ...x, [k]: n ?? 0 }))}
                      className="w-16"
                    />
                  </Field>
                ))}
                <Field
                  {...inh("Damage", ["combat", "damage"])}
                  hint={
                    DICE.test(c.damage)
                      ? `avg ${average(c.damage)}`
                      : "NdM or NdM+K"
                  }
                >
                  <input
                    className={`${input} w-24 font-mono ${DICE.test(c.damage) ? "" : "border-danger"}`}
                    value={c.damage}
                    onChange={(e) =>
                      setC((x) => ({ ...x, damage: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ["range", "Range"],
                    ["minRange", "Min range"],
                    ["speed", "Speed"],
                    ["sight", "Sight"],
                    ["fireInterval", "Fire every s"],
                  ] as const
                ).map(([k, name]) => (
                  <Field
                    key={k}
                    {...inh(name, ["combat", k])}
                    hint={c[k] === undefined ? "class default" : undefined}
                  >
                    <Num
                      optional
                      step={0.5}
                      min={0}
                      placeholder={String(d[k] ?? (k === "minRange" ? 0 : ""))}
                      value={c[k]}
                      onChange={(n) => setC((x) => ({ ...x, [k]: n }))}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>Against each Unit Class</span>
                <span className="grid grid-cols-[6rem_auto] items-center justify-start gap-x-3 gap-y-1.5">
                  {data.unitClasses.map((k) => {
                    const id = String(k.value.id);
                    return (
                      <Row
                        key={id}
                        {...inh(String(k.value.name), ["combat", "tiers", id])}
                      >
                        <Choice
                          label={`Against ${String(k.value.name)}`}
                          value={c.tiers?.[id] ?? "normal"}
                          options={[...TIERS]}
                          onChange={(t) =>
                            setC((x) => {
                              const tiers = { ...x.tiers, [id]: t };
                              return { ...x, tiers };
                            })
                          }
                        />
                      </Row>
                    );
                  })}
                </span>
              </div>
            </Section>
          </>
        );
      }}
      preview={({ _trainedAt, ...u }) => {
        const content = lookups(data, u);
        const cost = prefixed(u.cost);
        const shown = { ...u, cost, upkeep: prefixed(u.upkeep) };
        return DICE.test(u.combat.damage) ? (
          <>
            <UnitCard content={content} unit={shown} cost={cost} needs={[]} />
            <div className="border-edge bg-panel rounded-lg border px-2.5 py-2 text-[13px] shadow-[0_12px_32px_#000a]">
              <UnitInfo content={content} unit={shown} cost={cost} needs={[]} />
            </div>
          </>
        ) : (
          <span className="text-ink-3 text-sm">
            The preview waits for a damage roll like 2d6.
          </span>
        );
      }}
    />
  );
}
