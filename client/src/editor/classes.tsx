import type { ReactNode } from "react";
import {
  Choice,
  type Content,
  ContentPage,
  Field,
  input,
  label,
  Num,
  Section,
  type Write,
} from "./content";

// The Unit Classes page. A class lives in three places, and Save writes all
// three: its own file (name, flies, Task Force role), the Ruleset's
// battle.classDefaults, and each Terrain's movement cost (blank: can't cross).

type Stats = {
  speed: number;
  range: number;
  fireInterval: number;
  sight: number;
};
type UnitClass = {
  id: string;
  name: string;
  air?: boolean;
  taskForceRole?: "lead" | "follow" | "hunt";
  /** Its battle defaults, once edited. */
  _stats?: Stats;
  /** Its movement cost by Terrain file, once edited; undefined: can't cross. */
  _movement?: Record<string, number | undefined>;
};
const NEW_STATS: Stats = { speed: 1.5, range: 5, fireInterval: 1.5, sight: 8 };
const STATS = [
  ["speed", "Speed", 0.5],
  ["range", "Range", 0.5],
  ["fireInterval", "Fire every s", 0.25],
  ["sight", "Sight", 0.5],
] as const;

const classDefaults = (data: Content) =>
  ((
    data.rulesets[0]?.value as {
      battle?: { classDefaults?: Record<string, Stats> };
    }
  )?.battle?.classDefaults ?? {}) as Record<string, Stats>;
const defaultsOf = (data: Content, id: string) =>
  classDefaults(data)[id] ?? NEW_STATS;
/** Its movement cost on each Terrain, by file; undefined: can't cross. */
const movementOf = (data: Content, id: string) =>
  Object.fromEntries(
    data.terrains.map((t) => [
      t.file,
      (t.value.movement as Record<string, number> | undefined)?.[id],
    ]),
  );

/**
 * The files a save of c writes: its own, its Ruleset battle defaults if
 * they changed or it has none yet, and each Terrain whose cost changed.
 */
export function classWrites(
  data: Content,
  { _stats, _movement, ...c }: UnitClass,
  file: string,
): Write[] {
  const out: Write[] = [{ kind: "unitClasses", file, value: c }];
  const rules = data.rulesets[0];
  const stats = _stats ?? defaultsOf(data, c.id);
  const changed =
    JSON.stringify(stats) !== JSON.stringify(defaultsOf(data, c.id));
  if (rules && (changed || !classDefaults(data)[c.id]))
    out.push({
      kind: "rulesets",
      file: rules.file,
      path: ["battle", "classDefaults", c.id],
      value: stats,
    });
  const was = movementOf(data, c.id);
  for (const [t, cost] of Object.entries(_movement ?? was))
    if (cost !== was[t])
      out.push({
        kind: "terrains",
        file: t,
        path: ["movement", c.id],
        value: cost ?? null,
      });
  return out;
}

export function ClassesPage(props: {
  tabs: ReactNode;
  data: Content;
  reload: () => Promise<void>;
}) {
  const { data } = props;
  const rules = data.rulesets[0];
  const defaults = (id: string) => defaultsOf(data, id);
  const movement = (id: string) => movementOf(data, id);
  const users = (id: string) =>
    data.units.filter(
      (u) => (u.value.combat as { unitClass?: string })?.unitClass === id,
    );

  return (
    <ContentPage<UnitClass>
      tabs={props.tabs}
      noun="Unit Class"
      items={
        data.unitClasses as unknown as { file: string; value: UnitClass }[]
      }
      blank={() => ({ id: "", name: "" })}
      sub={(c) => (c.air ? "air" : "")}
      onSaved={props.reload}
      writes={(c, file) => classWrites(data, c, file)}
      form={(c, set) => {
        const stats = c._stats ?? defaults(c.id);
        const move = c._movement ?? movement(c.id);
        return (
          <>
            <Section title="Unit Class">
              <div className="flex flex-wrap items-end gap-3">
                <Field name="Id">
                  <input
                    className={`${input} w-36 font-mono`}
                    value={c.id}
                    pattern="[a-z0-9_\-]+"
                    onChange={(e) => set((x) => ({ ...x, id: e.target.value }))}
                  />
                </Field>
                <Field name="Name">
                  <input
                    className={`${input} w-40`}
                    value={c.name}
                    onChange={(e) =>
                      set((x) => ({ ...x, name: e.target.value }))
                    }
                  />
                </Field>
                <label className="flex h-7 items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!!c.air}
                    onChange={(e) =>
                      set(({ air: _, ...x }) =>
                        e.target.checked ? { ...x, air: true } : x,
                      )
                    }
                  />
                  Flies
                </label>
                <div className="flex flex-col gap-0.5">
                  <span className={label}>Task Force role</span>
                  <Choice
                    label="Task Force role"
                    value={c.taskForceRole ?? "follow"}
                    options={[
                      { id: "lead", name: "Lead" },
                      { id: "follow", name: "Follow" },
                      { id: "hunt", name: "Hunt" },
                    ]}
                    // Follow is the default, so it's left out of the file.
                    onChange={(r) =>
                      set(({ taskForceRole: _, ...x }) =>
                        r === "follow" ? x : { ...x, taskForceRole: r },
                      )
                    }
                  />
                </div>
              </div>
            </Section>
            <Section
              title="Battle defaults"
              hint="rules.jsonc · battle.classDefaults"
            >
              <div className="flex flex-wrap gap-3">
                {STATS.map(([k, name, step]) => (
                  <Field key={k} name={name}>
                    <Num
                      step={step}
                      min={0}
                      value={stats[k]}
                      onChange={(n) =>
                        set((x) => ({
                          ...x,
                          _stats: { ...stats, [k]: n ?? 0 },
                        }))
                      }
                    />
                  </Field>
                ))}
              </div>
            </Section>
            <Section
              title="Movement cost"
              hint="each Terrain's movement · blank: can't cross"
            >
              <div className="flex flex-wrap gap-3">
                {data.terrains.map((t) => (
                  <Field key={t.file} name={String(t.value.name)}>
                    <Num
                      optional
                      step={0.5}
                      min={0}
                      placeholder="—"
                      value={move[t.file]}
                      onChange={(n) =>
                        set((x) => ({
                          ...x,
                          _movement: { ...move, [t.file]: n },
                        }))
                      }
                      className="w-16"
                    />
                  </Field>
                ))}
              </div>
            </Section>
          </>
        );
      }}
      preview={(c) => (
        <>
          <span className={label}>Used by</span>
          <span className="flex flex-wrap gap-1">
            {users(c.id).map((u) => (
              <span
                key={u.file}
                className="border-edge text-ink-2 rounded-full border px-1.75 text-[11.5px]"
              >
                {String(u.value.name)}
              </span>
            ))}
            {users(c.id).length === 0 && (
              <span className="text-ink-4 text-[13px]">No units yet.</span>
            )}
          </span>
          <span className={label}>Files a save touches</span>
          <span className="text-ink-3 flex flex-col font-mono text-[11.5px]">
            <span>unitClasses/{c.id || "…"}.jsonc</span>
            <span>rulesets/{rules?.file}.jsonc</span>
            <span>terrains/*.jsonc (those that change)</span>
          </span>
          {!(c._movement ?? movement(c.id)) ||
          Object.values(c._movement ?? movement(c.id)).every(
            (v) => v === undefined,
          ) ? (
            <span className="text-accent text-[13px]">
              It can't cross any Terrain yet{c.air ? "" : ", so it can't move"}.
            </span>
          ) : null}
        </>
      )}
    />
  );
}
