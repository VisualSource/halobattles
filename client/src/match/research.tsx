import { useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { type Project, projectDone, type View } from "./store";
import { heldTechs, labs, pauseReason, techCost, techText } from "./tech";
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

/** Research per Payday, the way the top bar shows it; the server counts per second. */
const perPayday = (content: ContentLookups, view: View) =>
  view.research.rate * content.rules.paydaySeconds;

/** The top bar's Research readout: Research per Payday; it opens the panel. */
export function ResearchButton(props: {
  conn: MatchConnection;
  content: ContentLookups;
  open: boolean;
  onToggle: () => void;
}) {
  const view = useStore(props.conn.store, (s) => s.view);
  if (!view) return null;
  const { research } = view;
  const n = perPayday(props.content, view);
  return (
    <button
      type="button"
      aria-expanded={props.open}
      aria-controls="research"
      aria-label={`Research: +${n} a Payday, ${research.projects.length} of ${research.projectLimit} Projects`}
      title={`Research: +${n} a Payday (${research.rate} a second)`}
      onClick={props.onToggle}
      className={`flex flex-col items-center gap-0.5 rounded border-0 px-2 py-1 font-mono leading-none ${props.open ? "bg-raised shadow-[inset_0_-2px_0_var(--color-accent)]" : "bg-transparent"}`}
    >
      <Flask className="text-res-research" />
      <span className="text-ok">+{n}</span>
    </button>
  );
}

/**
 * Your Projects, one card per slot of your Project limit: what each
 * researches, where, and how far along. A free slot opens a picker: a Tech
 * from the hand or back on offer, then a Lab with a free Tech Slot.
 */
export function ResearchPanel(props: {
  conn: MatchConnection;
  content: ContentLookups;
  onClose: () => void;
}) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  const [picking, setPicking] = useState<number | null>(null);
  const pickRef = useDismiss<HTMLLIElement>(picking !== null, () =>
    setPicking(null),
  );
  if (!view) return null;
  const { research } = view;
  const planets = content.maps.get(view.map)?.planets ?? [];
  const planetName = (id: string) =>
    planets.find((p) => p.id === id)?.name ?? id;
  // Running Projects, then the free slots left under the Project limit.
  const free = Math.max(0, research.projectLimit - research.projects.length);
  const slots = [
    ...research.projects.map((p) => ({ key: p.tech, p })),
    ...Array.from({ length: free }, (_, n) => ({ key: `free-${n}`, p: null })),
  ];

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
        <span className="text-ok font-mono">+{perPayday(content, view)}</span>
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
        {slots.map(({ key, p }, i) => (
          <li
            key={key}
            ref={picking === i ? pickRef : undefined}
            className="relative"
          >
            {p ? (
              <ProjectCard
                conn={conn}
                content={content}
                view={view}
                project={p}
                now={now}
                planetName={planetName}
              />
            ) : (
              <button
                type="button"
                aria-expanded={picking === i}
                onClick={() => setPicking(picking === i ? null : i)}
                className={`flex h-32 w-full items-center justify-center gap-2.5 rounded-md p-2.5 ${picking === i ? "border-accent bg-accent-wash" : "border-edge border-dashed bg-transparent"}`}
              >
                <span className="border-edge text-accent flex size-11 flex-none items-center justify-center rounded-md border border-dashed text-2xl">
                  +
                </span>
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="font-semibold">Free Project slot</span>
                  <span className="text-ink-3 text-xs">
                    Choose what to research next
                  </span>
                </span>
              </button>
            )}
            {picking === i && (
              <TechPicker
                conn={conn}
                content={content}
                view={view}
                planetName={planetName}
                onDone={() => setPicking(null)}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProjectCard(props: {
  conn: MatchConnection;
  content: ContentLookups;
  view: View;
  project: Project;
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
    <div className="border-edge bg-item flex h-32 flex-col overflow-hidden rounded-md border">
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

/** Pick a Tech, then the Lab it goes in; picking the Lab starts it. */
function TechPicker(props: {
  conn: MatchConnection;
  content: ContentLookups;
  view: View;
  planetName: (id: string) => string;
  onDone: () => void;
}) {
  const { conn, content, view } = props;
  const pending = useStore(conn.local, (s) => isPending(s, "research"));
  const [chosen, setChosen] = useState<string | null>(null);
  const held = heldTechs(view);
  const { hand, saved } = view.research;
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
        chosen ? `Where to research ${nameOf(chosen)}` : "Research next"
      }
      className="border-edge bg-panel absolute top-0 left-full z-30 ml-3 w-95 rounded-lg border shadow-[0_12px_32px_#000a]"
    >
      {chosen === null ? (
        <>
          <div className="border-line flex items-baseline justify-between border-b px-3.5 py-3">
            <h3 className="font-display text-base font-semibold">
              Research next
            </h3>
            <span className="text-ink-3 text-xs">Picking deals a new hand</span>
          </div>
          {offers.length === 0 ? (
            <p className="text-ink-3 p-3.5 text-sm">
              Nothing to research right now. More Research, or the buildings a
              Tech needs, brings more.
            </p>
          ) : (
            <ul className="flex max-h-105 flex-col gap-1.5 overflow-y-auto p-2">
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
        <ul className="flex max-h-105 flex-col overflow-y-auto p-1.5">
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
                  className="flex w-full items-center gap-2.5 rounded border-0 bg-transparent p-2 text-left disabled:opacity-50"
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
