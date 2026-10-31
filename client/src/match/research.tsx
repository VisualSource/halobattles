import { useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import { FieldIcon, fieldsOf } from "./fields";
import { isPending } from "./local";
import { type Project, projectDone, type View } from "./store";
import {
  heldTechs,
  idleFields,
  labs,
  offered,
  pauseReason,
  techCost,
  techText,
} from "./tech";
import { useMatchNow } from "./time";
import { useDismiss } from "./windows";

const label = "font-mono text-[11px] text-ink-3 uppercase tracking-[0.08em]";

/** Static class names per Rarity, so Tailwind sees them. */
const rarityStyle: Record<string, { card: string; dot: string }> = {
  common: {
    card: "border-rarity-common/35 bg-rarity-common/8",
    dot: "bg-rarity-common",
  },
  uncommon: {
    card: "border-rarity-uncommon/35 bg-rarity-uncommon/8",
    dot: "bg-rarity-uncommon",
  },
  rare: {
    card: "border-rarity-rare/35 bg-rarity-rare/8",
    dot: "bg-rarity-rare",
  },
  legendary: {
    card: "border-rarity-legendary/35 bg-rarity-legendary/8",
    dot: "bg-rarity-legendary",
  },
};

function Flask(props: { className: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className={props.className}
    >
      <path
        d="M7 1.5h4M7.6 1.5v5L2.5 16h13L10.4 6.5v-5"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M4.6 12h8.8" stroke="var(--color-bar)" strokeWidth="1.4" />
    </svg>
  );
}

/** Every Research field's rate, combined, per second. */
const totalRate = (view: View) =>
  [...view.research.rates.values()].reduce((n, r) => n + r, 0);

/** Research per Payday, the way the top bar shows it; the server counts per second. */
const perPayday = (content: ContentLookups, rate: number) =>
  rate * content.rules.paydaySeconds;

/**
 * The top bar's Research readout: every field's Research per Payday,
 * combined. Hovering it shows each field's; clicking opens the panel.
 */
export function ResearchButton(props: {
  conn: MatchConnection;
  content: ContentLookups;
  open: boolean;
  onToggle: () => void;
  onPick: (field: string) => void;
}) {
  const { content } = props;
  const view = useStore(props.conn.store, (s) => s.view);
  const [hover, setHover] = useState(false);
  if (!view) return null;
  const n = perPayday(content, totalRate(view));
  // Hidden while the panel is open: it shows the free slots itself.
  const idle = props.open ? [] : idleFields(content, view);
  return (
    <div className="relative">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hovering only shows the button's own breakdown */}
      <div
        className="relative"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button
          type="button"
          aria-expanded={props.open}
          aria-controls="research"
          aria-describedby="research-rates"
          aria-label={`Research: +${n} a Payday, ${view.research.projects.length} of ${view.research.rates.size} fields researching`}
          onClick={props.onToggle}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onKeyDown={(e) => e.key === "Escape" && setHover(false)}
          className={`flex flex-col items-center gap-0.5 rounded border-0 px-2 py-1 font-mono leading-none ${props.open ? "bg-raised shadow-[inset_0_-2px_0_var(--color-accent)]" : "bg-transparent"}`}
        >
          <Flask className="text-res-research" />
          <span className="text-ok">+{n}</span>
        </button>
        <div
          id="research-rates"
          role="tooltip"
          hidden={!hover}
          className="border-edge bg-panel absolute top-12 left-0 z-30 flex w-62 flex-col gap-2.5 rounded-lg border p-3.5 text-[13px] shadow-[0_12px_32px_#000a]"
        >
          <span className="font-display text-base font-semibold">
            Research a Payday
          </span>
          {fieldsOf(content).map((f) => (
            <span key={f.id} className="flex items-center gap-2">
              <FieldIcon content={content} field={f.id} />
              <span className="flex-1">{f.name}</span>
              <span className="text-ok font-mono">
                +{perPayday(content, view.research.rates.get(f.id) ?? 0)}
              </span>
            </span>
          ))}
          <span className="border-line text-ink-3 flex justify-between border-t pt-2 text-xs">
            <span>Total</span>
            <span className="font-mono">
              +{n} · {totalRate(view)} a second
            </span>
          </span>
        </div>
      </div>
      {idle.length > 0 && (
        <IdleAlerts content={content} fields={idle} onPick={props.onPick} />
      )}
    </div>
  );
}

/**
 * An alert for each idle field, hanging on a rail below the Research
 * button: the field's icon, framed in its colour. Clicking one opens the
 * panel at that field's Tech picker.
 */
function IdleAlerts(props: {
  content: ContentLookups;
  fields: ReturnType<typeof idleFields>;
  onPick: (field: string) => void;
}) {
  const last = props.fields.length - 1;
  return (
    // z-10, like the windows: they come later in the page, so one dragged up here covers the alerts.
    <div className="absolute top-full left-1/2 z-10 flex -translate-x-1/2 flex-col items-center">
      <span aria-hidden="true" className="bg-edge h-2.5 w-px" />
      <ul aria-label="Idle Research fields" className="flex gap-2.5">
        {props.fields.map((f, i) => (
          <li key={f.id} className="group relative flex flex-col items-center">
            <span
              aria-hidden="true"
              className={`bg-edge absolute top-0 h-px ${i === 0 ? "left-1/2" : "-left-1.25"} ${i === last ? "right-1/2" : "-right-1.25"}`}
            />
            <span
              aria-hidden="true"
              className="h-3.5 w-px opacity-80"
              style={{ backgroundColor: f.colour }}
            />
            <button
              type="button"
              aria-label={`${f.name} research is idle`}
              onClick={() => props.onPick(f.id)}
              className="bg-panel flex size-11 items-center justify-center rounded-[7px] border-[1.5px] p-0 shadow-[0_0_0_3px_#0008]"
              style={{ borderColor: f.colour }}
            >
              <FieldIcon content={props.content} field={f.id} size="size-5.5" />
            </button>
            <span
              role="tooltip"
              className="border-edge bg-panel absolute top-full mt-2 hidden rounded-lg border px-2.5 py-2 text-[13px] whitespace-nowrap shadow-[0_12px_32px_#000a] group-focus-within:block group-hover:block"
            >
              <span className="font-semibold" style={{ color: f.colour }}>
                {f.name}
              </span>{" "}
              research is idle
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Your Projects, one slot per Research field, headed by the field and its
 * rate: what each researches, where, and how far along. A free slot opens
 * a picker: a Tech from that field's hand or back on offer, then a Lab with
 * a free Tech Slot. A free field with nothing on offer stays, disabled.
 */
export function ResearchPanel(props: {
  conn: MatchConnection;
  content: ContentLookups;
  /** The field whose Tech picker opens first. */
  pick?: string;
  onClose: () => void;
}) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  const [picking, setPicking] = useState<string | null>(props.pick ?? null);
  const pickRef = useDismiss<HTMLLIElement>(picking !== null, () =>
    setPicking(null),
  );
  if (!view) return null;
  const { research } = view;
  const planets = content.maps.get(view.map)?.planets ?? [];
  const planetName = (id: string) =>
    planets.find((p) => p.id === id)?.name ?? id;
  const fieldOf = (tech: string) => content.techs.get(tech)?.field;

  return (
    <section
      id="research"
      aria-labelledby="research-title"
      className="border-edge bg-panel/95 absolute top-4 left-4 z-20 flex w-105 flex-col rounded-lg border shadow-[0_12px_32px_#000a]"
    >
      <div className="border-line bg-bar flex h-11 items-center gap-2.5 rounded-t-lg border-b pr-2 pl-3.5">
        <h2
          id="research-title"
          className="font-display flex-1 text-lg font-semibold"
        >
          Research
        </h2>
        <span className="text-ok font-mono">
          +{perPayday(content, totalRate(view))}
        </span>
        <button
          type="button"
          aria-label="Close Research"
          onClick={props.onClose}
          className="text-ink-3 size-8 border-0 bg-transparent p-0"
        >
          ✕
        </button>
      </div>
      <ol className="flex flex-col gap-2.5 p-3">
        {fieldsOf(content).map((f) => {
          const p = research.projects.find((x) => fieldOf(x.tech) === f.id);
          const rate = research.rates.get(f.id) ?? 0;
          return (
            <li
              key={f.id}
              ref={picking === f.id ? pickRef : undefined}
              className="relative flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5 px-0.5">
                <FieldIcon content={content} field={f.id} />
                <span
                  className="font-display text-[13px] font-semibold tracking-[0.05em] uppercase"
                  style={{ color: f.colour }}
                >
                  {f.name}
                </span>
                <span className="text-ink-2 ml-auto font-mono text-xs">
                  +{perPayday(content, rate)} · {rate}/s
                </span>
              </div>
              {p ? (
                <ProjectCard
                  conn={conn}
                  content={content}
                  view={view}
                  project={p}
                  colour={f.colour}
                  now={now}
                  planetName={planetName}
                />
              ) : offered(content, view, f.id) ? (
                <button
                  type="button"
                  aria-expanded={picking === f.id}
                  onClick={() => setPicking(picking === f.id ? null : f.id)}
                  className={`flex h-28 w-full items-center justify-center gap-2.5 rounded-md p-2.5 ${picking === f.id ? "border-accent bg-accent-wash" : "border-edge border-dashed bg-transparent"}`}
                >
                  <span className="border-edge text-accent flex size-11 flex-none items-center justify-center rounded-md border border-dashed text-2xl">
                    +
                  </span>
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="font-semibold">Free {f.name} slot</span>
                    <span className="text-ink-3 text-xs">
                      Choose what to research next
                    </span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="border-edge text-ink-3 flex h-28 w-full items-center justify-center gap-2.5 rounded-md border-dashed bg-transparent p-2.5"
                >
                  <span className="border-edge text-ink-4 flex size-11 flex-none items-center justify-center rounded-md border border-dashed text-2xl">
                    ·
                  </span>
                  <span className="flex max-w-65 flex-col gap-0.5 text-left">
                    <span className="font-semibold">
                      Nothing to research yet
                    </span>
                    <span className="text-xs">
                      More {f.name} Research, or the buildings a Tech needs,
                      brings more.
                    </span>
                  </span>
                </button>
              )}
              {picking === f.id && !p && (
                <TechPicker
                  conn={conn}
                  content={content}
                  view={view}
                  field={f.id}
                  planetName={planetName}
                  onDone={() => setPicking(null)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProjectCard(props: {
  conn: MatchConnection;
  content: ContentLookups;
  view: View;
  project: Project;
  colour: string;
  now: number;
  planetName: (id: string) => string;
}) {
  const { conn, content, view, project: p } = props;
  const pending = useStore(conn.local, (s) => isPending(s, "research"));
  const t = content.techs.get(p.tech);
  const name = t?.name ?? p.tech;
  const done = projectDone(p, props.now);
  const paused = pauseReason(content, view, p, props.planetName);
  const lab =
    content.buildings.get(view.planets.get(p.planet)?.buildings[p.slot] ?? "")
      ?.name ?? "Lab";
  return (
    <div
      className="border-edge bg-item flex h-28 flex-col overflow-hidden rounded-md border border-l-3"
      style={{ borderLeftColor: props.colour }}
    >
      <div className="border-line bg-raised flex items-center gap-2 border-b px-2.5 py-1.5">
        <span className="font-display flex-1 truncate font-semibold">
          {name}
        </span>
        <span className="text-ink-2 font-mono text-xs">
          {Math.floor(done)} / {p.cost}
        </span>
      </div>
      <div className="flex gap-2.5 p-2.5">
        <span className="border-edge bg-tile flex size-11 flex-none items-center justify-center rounded-md border">
          <Flask className="text-ink-3" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm">
            {t ? techText(content, t) : ""}
          </span>
          <span className="text-ink-3 truncate text-xs">
            {props.planetName(p.planet)} · {lab}
          </span>
        </span>
        <button
          type="button"
          aria-label={`Cancel ${name}`}
          title="Cancel: it keeps its progress"
          disabled={pending}
          onClick={() => conn.cancelProject(p.tech)}
          className="border-edge text-ink-3 size-7.5 flex-none rounded border bg-transparent p-0"
        >
          ✕
        </button>
      </div>
      <div className="mt-auto flex items-center gap-2.5 px-2.5 pb-2.5">
        <div className="border-line bg-well h-2 flex-1 overflow-hidden rounded border">
          <div
            className={`h-full ${paused ? "bg-edge" : "bg-ok"}`}
            style={{ width: `${p.cost > 0 ? (100 * done) / p.cost : 0}%` }}
          />
        </div>
        {paused && (
          <span className="text-danger font-mono text-xs whitespace-nowrap">
            {paused}
          </span>
        )}
      </div>
    </div>
  );
}

/** Pick one of field's Techs, then the Lab it goes in; picking the Lab starts it. */
function TechPicker(props: {
  conn: MatchConnection;
  content: ContentLookups;
  view: View;
  field: string;
  planetName: (id: string) => string;
  onDone: () => void;
}) {
  const { conn, content, view } = props;
  const pending = useStore(conn.local, (s) => isPending(s, "research"));
  const [chosen, setChosen] = useState<string | null>(null);
  const held = heldTechs(view);
  const hand = view.research.hands.get(props.field) ?? [];
  const fieldName = content.rules.tech.fields[props.field]?.name ?? props.field;
  const saved = view.research.saved.filter(
    (v) => content.techs.get(v.tech)?.field === props.field,
  );
  const nameOf = (id: string) => content.techs.get(id)?.name ?? id;
  const offers = [
    ...hand.map((id) => ({
      id,
      tag: "",
      note: "",
      cost: `${techCost(content, held, id)}`,
    })),
    ...saved.map((v) => ({
      id: v.tech,
      tag: v.lost ? "Recover" : "Resume",
      note: v.lost
        ? "Lost with its Lab · half cost"
        : `Cancelled at ${Math.floor(v.done)} of ${v.cost}`,
      cost: v.lost ? `${v.cost}` : `${Math.ceil(v.cost - v.done)} left`,
    })),
  ];

  return (
    <div
      role="dialog"
      aria-label={
        chosen
          ? `Where to research ${nameOf(chosen)}`
          : `Research next in ${fieldName}`
      }
      className="border-edge bg-panel absolute top-0 left-full z-30 ml-3 flex h-120 w-95 flex-col rounded-lg border shadow-[0_12px_32px_#000a]"
    >
      {chosen === null ? (
        <>
          <div className="border-line flex items-center gap-2 border-b px-3.5 py-3">
            <FieldIcon content={content} field={props.field} />
            <h3 className="font-display flex-1 text-base font-semibold">
              {fieldName}: research next
            </h3>
            <span className="text-ink-3 text-xs">Picking deals a new hand</span>
          </div>
          {offers.length === 0 ? (
            <p className="text-ink-3 p-3.5 text-sm">
              Nothing to research right now. More Research, or the buildings a
              Tech needs, brings more.
            </p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
              {offers.map((o, i) => {
                const t = content.techs.get(o.id);
                const style =
                  rarityStyle[t?.rarity ?? "common"] ?? rarityStyle.common;
                return (
                  <li key={o.id}>
                    {i === hand.length && (
                      <div
                        className={`${label} border-line mt-0.5 border-t px-1 pt-2 pb-1.5`}
                      >
                        Back on offer
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setChosen(o.id)}
                      className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left ${style?.card}`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`size-2 flex-none rounded-full ${style?.dot}`}
                          />
                          <span className="font-semibold">
                            {t?.name ?? o.id}
                          </span>
                          {o.tag && (
                            <span
                              className={`${label} ${o.tag === "Recover" ? "text-danger" : "text-ok"}`}
                            >
                              {o.tag}
                            </span>
                          )}
                        </span>
                        <span className="text-ink-2 text-xs">
                          {o.note || (t ? techText(content, t) : "")}
                        </span>
                      </span>
                      <span className="font-mono text-xs">{o.cost}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <LabPicker
          conn={conn}
          content={content}
          view={view}
          tech={chosen}
          pending={pending}
          planetName={props.planetName}
          onBack={() => setChosen(null)}
          onDone={props.onDone}
        />
      )}
    </div>
  );
}

function LabPicker(props: {
  conn: MatchConnection;
  content: ContentLookups;
  view: View;
  tech: string;
  pending: boolean;
  planetName: (id: string) => string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { content } = props;
  const nameOf = (id: string) => content.techs.get(id)?.name ?? id;
  const all = labs(content, props.view);
  return (
    <>
      <div className="border-line flex items-center gap-2 border-b px-3.5 py-2.5">
        <button
          type="button"
          aria-label="Back to the Techs"
          onClick={props.onBack}
          className="border-edge size-7 rounded border bg-transparent p-0"
        >
          ‹
        </button>
        <h3 className="font-display flex-1 text-base font-semibold">
          {nameOf(props.tech)}: in which Lab?
        </h3>
      </div>
      {all.length === 0 ? (
        <p className="text-ink-3 p-3.5 text-sm">
          You have no Lab. Build one to research.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {all.map((l) => {
            const holds = [
              ...l.holds.map(nameOf),
              ...l.researching.map((t) => `${nameOf(t)} (researching)`),
            ];
            return (
              <li key={`${l.planet}-${l.slot}`}>
                <button
                  type="button"
                  disabled={l.free === 0 || props.pending}
                  onClick={() => {
                    props.conn.startProject(props.tech, l.planet, l.slot);
                    props.onDone();
                  }}
                  className="border-edge bg-item flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left disabled:opacity-50"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold">
                      {props.planetName(l.planet)}{" "}
                      <span className="text-ink-3 font-normal">
                        · {l.name}, slot {l.slot + 1}
                      </span>
                    </span>
                    <span className="text-ink-3 truncate text-xs">
                      {holds.join(" · ") || "Empty"}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-xs ${l.free ? "text-ok" : "text-ink-4"}`}
                  >
                    {l.free ? `${l.free} free` : "full"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-ink-3 px-3.5 pt-1 pb-3 text-xs">
        Losing a Lab loses every Tech it holds.
      </p>
    </>
  );
}
