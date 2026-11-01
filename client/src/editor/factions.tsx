import type { ReactNode } from "react";
import type { Faction } from "../gen/content";
import {
  type Content,
  ContentPage,
  Field,
  input,
  label,
  Num,
  Section,
} from "./content";

// The Factions page: name and icon, the Battle AI's and Bots' weights (blank
// is the neutral 1), and the Starting Kit placed on its Capital.

const AI = ["aggression", "caution", "cover", "raid", "scout", "mass"] as const;
const BOT = [
  "expand",
  "attack",
  "defend",
  "economy",
  "army",
  "research",
] as const;
const MAX_STACKS = 3;
const small =
  "border-edge text-ink-3 rounded border bg-transparent px-2 py-0.5 text-xs";

/** A Faction as the form edits it: up to MAX_STACKS Stacks, as a plain list. */
type Draft = Omit<Faction, "startingKit"> & {
  startingKit: {
    buildings: string[];
    stacks: { unit: string; count: number }[][];
  };
};

const blank = (): Draft => ({
  id: "",
  name: "",
  startingKit: { buildings: [], stacks: [] },
});

/** f with its ai block's key set, or removed when blank; an empty block goes. */
export function weight(
  f: Draft,
  key: string,
  v: number | undefined,
  bot: boolean,
): Draft {
  const ai: Record<string, unknown> = { ...f.ai };
  const block: Record<string, unknown> = bot ? { ...(ai.bot as object) } : ai;
  if (v === undefined) delete block[key];
  else block[key] = v;
  if (bot) {
    if (Object.keys(block).length) ai.bot = block;
    else delete ai.bot;
  }
  const { ai: _, ...rest } = f;
  return Object.keys(ai).length ? { ...rest, ai: ai as Faction["ai"] } : rest;
}

export function FactionsPage(props: {
  tabs: ReactNode;
  data: Content;
  reload: () => Promise<void>;
}) {
  const { data } = props;
  const of = (kind: "units" | "buildings", faction: string) =>
    data[kind].filter((x) => x.value.faction === faction);
  const name = (kind: "units" | "buildings", id: string) =>
    String(data[kind].find((x) => x.value.id === id)?.value.name ?? id);

  return (
    <ContentPage<Draft>
      tabs={props.tabs}
      noun="Faction"
      items={data.factions as unknown as { file: string; value: Draft }[]}
      blank={blank}
      sub={(f) => `${of("units", f.id).length} units`}
      onSaved={props.reload}
      writes={(f, file) => [{ kind: "factions", file, value: f }]}
      form={(f, set) => {
        const kit = f.startingKit;
        const setKit = (k: Draft["startingKit"]) =>
          set((x) => ({ ...x, startingKit: k }));
        const buildings = of("buildings", f.id);
        const units = of("units", f.id);
        return (
          <>
            <Section title="Faction">
              <div className="flex flex-wrap gap-3">
                <Field name="Id">
                  <input
                    className={`${input} w-36 font-mono`}
                    value={f.id}
                    pattern="[a-z0-9_\-]+"
                    onChange={(e) => set((x) => ({ ...x, id: e.target.value }))}
                  />
                </Field>
                <Field name="Name">
                  <input
                    className={`${input} w-44`}
                    value={f.name}
                    onChange={(e) =>
                      set((x) => ({ ...x, name: e.target.value }))
                    }
                  />
                </Field>
                <Field name="Icon" hint="__mod__/path, from the Mod's assets">
                  <input
                    className={`${input} w-60 font-mono`}
                    value={f.icon ?? ""}
                    placeholder="__base__/icons/…"
                    onChange={(e) =>
                      set(({ icon: _, ...x }) =>
                        e.target.value ? { ...x, icon: e.target.value } : x,
                      )
                    }
                  />
                </Field>
              </div>
            </Section>
            <Section
              title="Battle AI"
              hint="each scales one kind of choice · blank is 1"
            >
              <div className="flex flex-wrap gap-3">
                {AI.map((k) => (
                  <Field key={k} name={k}>
                    <Num
                      optional
                      step={0.05}
                      min={0}
                      placeholder="1"
                      value={f.ai?.[k]}
                      onChange={(v) => set((x) => weight(x, k, v, false))}
                    />
                  </Field>
                ))}
              </div>
            </Section>
            <Section
              title="Bots"
              hint="galaxy goals, times the difficulty's · blank is 1"
            >
              <div className="flex flex-wrap gap-3">
                {BOT.map((k) => (
                  <Field key={k} name={k}>
                    <Num
                      optional
                      step={0.05}
                      min={0}
                      placeholder="1"
                      value={f.ai?.bot?.[k]}
                      onChange={(v) => set((x) => weight(x, k, v, true))}
                    />
                  </Field>
                ))}
              </div>
              <Field name="Bot names" hint="one a line; Bots take them in turn">
                <textarea
                  className={`${input} min-h-18 w-80`}
                  value={(f.ai?.bot?.names ?? []).join("\n")}
                  onChange={(e) => {
                    const names = e.target.value.split("\n");
                    set((x) => {
                      const { names: _, ...bot } = x.ai?.bot ?? {};
                      return {
                        ...x,
                        ai: {
                          ...x.ai,
                          bot: e.target.value ? { ...bot, names } : bot,
                        },
                      };
                    });
                  }}
                />
              </Field>
            </Section>
            <Section
              title="Starting Kit"
              hint="placed on its Capital when a Match starts"
            >
              <div className="flex flex-col gap-1">
                <span className={label}>Buildings, in Building Slot order</span>
                <ol className="m-0 flex flex-col gap-1 p-0">
                  {kit.buildings.map((b, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: a building can sit in two slots
                      key={i}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="text-ink-4 w-4 font-mono">{i + 1}</span>
                      <span className="w-40">{name("buildings", b)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${name("buildings", b)}`}
                        className={small}
                        onClick={() =>
                          setKit({
                            ...kit,
                            buildings: kit.buildings.filter((_, j) => j !== i),
                          })
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <select
                  className={`${input} w-56`}
                  value=""
                  aria-label="Add a building"
                  onChange={(e) =>
                    e.target.value &&
                    setKit({
                      ...kit,
                      buildings: [...kit.buildings, e.target.value],
                    })
                  }
                >
                  <option value="">+ Add a building</option>
                  {buildings.map((b) => (
                    <option key={b.file} value={String(b.value.id)}>
                      {String(b.value.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                {kit.stacks.map((st, s) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Stacks are by place
                    key={s}
                    className="border-line flex flex-col gap-1 rounded border p-2"
                  >
                    <span className="flex items-center justify-between">
                      <span className={label}>Stack {s + 1}</span>
                      <button
                        type="button"
                        className={small}
                        onClick={() =>
                          setKit({
                            ...kit,
                            stacks: kit.stacks.filter((_, j) => j !== s),
                          })
                        }
                      >
                        Remove
                      </button>
                    </span>
                    {st.map((e, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: slots are by place
                        key={i}
                        className="flex items-center gap-1.5 text-[13px]"
                      >
                        <span className="w-28 truncate">
                          {name("units", e.unit)}
                        </span>
                        <Num
                          min={1}
                          value={e.count}
                          className="w-16"
                          onChange={(n) => {
                            const stacks = kit.stacks.map((x, j) =>
                              j === s
                                ? x.map((y, k) =>
                                    k === i ? { ...y, count: n ?? 1 } : y,
                                  )
                                : x,
                            );
                            setKit({ ...kit, stacks });
                          }}
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${name("units", e.unit)}`}
                          className={small}
                          onClick={() => {
                            const stacks = kit.stacks.map((x, j) =>
                              j === s ? x.filter((_, k) => k !== i) : x,
                            );
                            setKit({ ...kit, stacks });
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <select
                      className={input}
                      value=""
                      aria-label={`Add a unit to Stack ${s + 1}`}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const stacks = kit.stacks.map((x, j) =>
                          j === s
                            ? [...x, { unit: e.target.value, count: 1 }]
                            : x,
                        );
                        setKit({ ...kit, stacks });
                      }}
                    >
                      <option value="">+ Add a unit</option>
                      {units.map((u) => (
                        <option key={u.file} value={String(u.value.id)}>
                          {String(u.value.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={kit.stacks.length >= MAX_STACKS}
                  className={`${small} self-start disabled:opacity-40`}
                  onClick={() =>
                    setKit({ ...kit, stacks: [...kit.stacks, []] })
                  }
                >
                  + Add a Stack
                </button>
              </div>
            </Section>
          </>
        );
      }}
      preview={(f) => (
        <>
          <span className={label}>Its content</span>
          <span className="text-ink-2 text-[13px]">
            {of("units", f.id).length} units · {of("buildings", f.id).length}{" "}
            buildings
          </span>
          {f.id && of("buildings", f.id).length === 0 && (
            <span className="text-accent text-[13px]">
              No buildings yet: its units need one that trains them.
            </span>
          )}
          <span className={label}>Starting Kit</span>
          <span className="text-ink-2 text-[13px]">
            {f.startingKit.buildings
              .map((b) => name("buildings", b))
              .join(", ") || "No buildings"}
          </span>
          {f.startingKit.stacks.map((st, s) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: Stacks are by place
              key={s}
              className="text-ink-3 text-[13px]"
            >
              Stack {s + 1}:{" "}
              {st
                .map((e) => `${e.count} ${name("units", e.unit)}`)
                .join(", ") || "empty"}
            </span>
          ))}
        </>
      )}
    />
  );
}
