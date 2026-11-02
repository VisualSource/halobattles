import { cn } from "cn";
import { type ReactNode, useEffect, useState } from "react";

// The editor's content pages (Units, Weapon Types, Unit Classes, Factions):
// a searchable list, a form for the one picked, a live preview, and Save,
// which writes every file the change reaches at once and runs halo-mod check.
// Served by client/map-editor.plugin.ts.

export type Item<T> = { file: string; value: T };
/** Everything the content pages read, raw from mods/base/data. */
export type Content = {
  units: Item<Record<string, unknown>>[];
  weaponTypes: Item<Record<string, unknown>>[];
  unitClasses: Item<Record<string, unknown>>[];
  factions: Item<Record<string, unknown>>[];
  buildings: Item<Record<string, unknown>>[];
  terrains: Item<Record<string, unknown>>[];
  rulesets: Item<Record<string, unknown>>[];
  resources: { id: string; name: string; order?: number }[];
};
export type Write =
  | { kind: keyof Content; file: string; value: object }
  | { kind: keyof Content; file: string; path: string[]; value: unknown };
type Check = { kind: "idle" | "busy" | "ok" | "bad"; text: string };

export const label =
  "font-mono text-[11px] text-ink-3 uppercase tracking-[0.08em]";
export const input =
  "bg-well border-edge text-ink rounded border px-1.5 py-1 text-[13px] disabled:opacity-50";
const ID = /^[a-z0-9_-]+$/;

/** The content pages' data, fetched once and again after each save. */
export function useContent() {
  const [data, setData] = useState<Content | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    fetch("/__editor/content")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? r.statusText);
        setData(body as Content);
      })
      .catch((e) => setError(String(e)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once
  useEffect(() => {
    void load();
  }, []);
  return { data, error, reload: load };
}

/** ↺: put a Unit Variant's field back to its parent's value. */
export const Reset = (props: { onClick: () => void }) => (
  <button
    type="button"
    title="Reset to the parent's value"
    aria-label="Reset to the parent's value"
    onClick={(e) => {
      e.preventDefault(); // not the label's control
      props.onClick();
    }}
    className="text-ink-3 hover:text-ink border-0 bg-transparent p-0 text-[11px] leading-none"
  >
    ↺
  </button>
);

/** A labelled field above its control; reset adds a ↺ beside the name. */
export function Field(props: {
  name: string;
  hint?: string;
  reset?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className={cn("flex flex-col gap-0.5", props.className)}>
      <span className={cn(label, "flex items-center gap-1")}>
        {props.name}
        {props.reset && <Reset onClick={props.reset} />}
      </span>
      {props.children}
      {props.hint && (
        <span className="text-ink-4 text-[11px]">{props.hint}</span>
      )}
    </label>
  );
}

/**
 * A number input; blank is undefined when optional, shown with its
 * placeholder (say a Unit Class default).
 */
export function Num(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  optional?: boolean;
  placeholder?: string;
  step?: number;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={cn(input, "w-20 font-mono", props.className)}
      value={props.value ?? ""}
      placeholder={props.placeholder}
      step={props.step ?? 1}
      min={props.min}
      onChange={(e) =>
        props.onChange(
          e.target.value === ""
            ? props.optional
              ? undefined
              : 0
            : Number(e.target.value),
        )
      }
    />
  );
}

export function Section(props: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-line m-0 flex flex-col gap-2.5 rounded-lg border px-3 pt-1 pb-3">
      <legend className="font-display text-ink-2 px-1.5 text-[13px] font-semibold">
        {props.title}
        {props.hint && (
          <span className="text-ink-4 ml-2 font-sans text-[11px] font-normal">
            {props.hint}
          </span>
        )}
      </legend>
      {props.children}
    </fieldset>
  );
}

/** A segmented choice: one option pressed. */
export function Choice<T extends string>(props: {
  value: T;
  options: { id: T; name: string; className?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset
      aria-label={props.label}
      className="border-edge m-0 inline-flex w-fit overflow-hidden rounded border p-0"
    >
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === props.value}
          onClick={() => props.onChange(o.id)}
          className={cn(
            "border-edge text-ink-3 border-0 border-r bg-transparent px-2.5 py-0.5 text-xs last:border-r-0",
            o.id === props.value && (o.className ?? "bg-raised text-ink"),
          )}
        >
          {o.name}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * One content page: the list, the form for the picked or new entity, its
 * preview, and Save. `writes` turns the draft into the file changes; the
 * first is the entity's own file.
 */
export function ContentPage<T extends { id?: unknown; name?: unknown }>(props: {
  tabs: ReactNode;
  noun: string; // "unit", "Weapon Type"…
  items: Item<T>[];
  blank: () => T;
  /** The list's group heading for one, if the list is grouped. */
  group?: (v: T) => string;
  sub?: (v: T) => string;
  /** Its place in its group, by name unless given. */
  order?: (v: T) => string;
  /** How far in to indent it in the list. */
  indent?: (v: T) => number;
  form: (draft: T, set: (f: (d: T) => T) => void) => ReactNode;
  preview?: (draft: T) => ReactNode;
  writes: (draft: T, file: string) => Write[];
  onSaved: () => Promise<void>;
}) {
  const [opened, setOpened] = useState<string | null>(null); // its file, or null for a new one
  const [draft, setDraft] = useState<T>(props.blank);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [check, setCheck] = useState<Check>({ kind: "idle", text: "" });
  const set = (f: (d: T) => T) => {
    setDraft(f);
    setDirty(true);
  };
  const pick = (item: Item<T> | null) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setOpened(item?.file ?? null);
    setDraft(item ? structuredClone(item.value) : props.blank());
    setDirty(false);
    setCheck({ kind: "idle", text: "" });
  };
  const id = String(draft.id ?? "");
  const save = async () => {
    const file = opened ?? id;
    if (
      opened === null &&
      props.items.some((i) => i.file === id) &&
      !confirm(`A ${props.noun} called ${id} already exists. Overwrite it?`)
    )
      return;
    setCheck({ kind: "busy", text: "Saving and checking…" });
    setDirty(false); // an edit during the check (up to 2 minutes) marks it dirty again
    try {
      const r = await fetch("/__editor/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writes: props.writes(draft, file) }),
      });
      const body = (await r.json()) as {
        error?: string;
        files?: string[];
        ok?: boolean;
        output?: string;
      };
      if (!r.ok) throw new Error(body.error ?? r.statusText);
      setOpened(file);
      await props.onSaved();
      setCheck({
        kind: body.ok ? "ok" : "bad",
        text: `Saved ${(body.files ?? []).join(", ")} · ${body.output ?? ""}`,
      });
    } catch (e) {
      setDirty(true);
      setCheck({ kind: "bad", text: String(e) });
    }
  };

  const q = search.trim().toLowerCase();
  const shown = props.items
    .filter(
      (i) =>
        !q ||
        String(i.value.name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(i.value.id ?? "").includes(q),
    )
    .sort(
      (a, b) =>
        (props.group?.(a.value) ?? "").localeCompare(
          props.group?.(b.value) ?? "",
        ) ||
        (props.order?.(a.value) ?? String(a.value.name)).localeCompare(
          props.order?.(b.value) ?? String(b.value.name),
        ),
    );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-line bg-bar flex h-13 flex-none items-center gap-3 border-b px-3.5">
        {props.tabs}
        <span className="flex-1" />
        <span className="text-ink-3 text-sm">
          {opened ?? `new ${props.noun}`}
          {dirty && " · unsaved"}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!ID.test(id) || check.kind === "busy"}
          className="bg-accent text-accent-ink font-display h-8 rounded border-0 px-4 font-bold tracking-wider disabled:opacity-50"
        >
          SAVE
        </button>
      </header>
      <main className="flex min-h-0 flex-1">
        <nav className="border-line bg-panel flex w-56 flex-none flex-col gap-0.5 overflow-y-auto border-r p-2">
          <input
            type="search"
            aria-label={`Search ${props.noun}s`}
            placeholder={`Search ${props.noun}s`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(input, "mb-1.5")}
          />
          <button
            type="button"
            onClick={() => pick(null)}
            className="border-edge text-ink-3 mb-1.5 rounded border border-dashed bg-transparent py-1.5 text-[13px]"
          >
            + New {props.noun}
          </button>
          {shown.map((i, n) => {
            const g = props.group?.(i.value);
            const prev = shown[n - 1]; // the first of a group gets its heading
            const head =
              g !== undefined && (!prev || g !== props.group?.(prev.value));
            return (
              <div key={i.file} className="contents">
                {head && (
                  <span className={cn(label, "px-1.5 pt-2 pb-1")}>{g}</span>
                )}
                <button
                  type="button"
                  onClick={() => pick(i)}
                  style={{
                    paddingLeft: `${0.5 + (props.indent?.(i.value) ?? 0)}rem`,
                  }}
                  className={cn(
                    "text-ink-2 flex items-baseline justify-between gap-2 rounded border-0 bg-transparent px-2 py-1 text-left text-[13px]",
                    i.file === opened && "bg-raised text-ink",
                  )}
                >
                  <span className="truncate">
                    {String(i.value.name ?? i.file)}
                  </span>
                  <span className="text-ink-4 flex-none font-mono text-[11px]">
                    {props.sub?.(i.value)}
                  </span>
                </button>
              </div>
            );
          })}
        </nav>
        <form
          className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          {props.form(draft, set)}
        </form>
        {props.preview && (
          <aside className="border-line bg-raised flex w-84 flex-none flex-col gap-3 overflow-y-auto border-l p-3">
            <span className={label}>Preview</span>
            {props.preview(draft)}
          </aside>
        )}
      </main>
      <footer className="border-line bg-bar flex h-10 flex-none items-center border-t px-3.5 text-sm">
        <span
          title={check.text}
          className={cn(
            "truncate",
            check.kind === "ok" && "text-ok",
            check.kind === "bad" && "text-danger",
            (check.kind === "idle" || check.kind === "busy") && "text-ink-3",
          )}
        >
          {check.text.replace(/\s+/g, " ") ||
            `Pick a ${props.noun}, or make a new one.`}
        </span>
      </footer>
    </div>
  );
}
