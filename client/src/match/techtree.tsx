import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { Tech } from "../gen/content";
import { InfoPopover } from "../ui/popover";
import type { MatchConnection } from "./connection";
import { FieldIcon, fieldsOf } from "./fields";
import { projectDone } from "./store";
import {
  heldTechs,
  type TreeStatus,
  techCost,
  techText,
  treeLayout,
  treeStatus,
  treeTechs,
} from "./tech";
import { useMatchNow } from "./time";
import { Floating } from "./windows";

// The tech tree: read-only, a field at a time, as a node graph you pan by
// dragging and zoom with the wheel. Starting research stays in the Research
// panel. docs/specs/tech-spec.md#ui

const W = 232; // a card's size, fixed so the layout is pure
const H = 104;
const GX = 80; // between columns, and rows
const GY = 18;
const ZOOM = { min: 0.35, max: 1.6 };

const CHIP = {
  held: "border-ok-edge bg-ok-wash text-ok",
  researching: "border-res-research/50 bg-res-research/10 text-res-research",
  saved: "border-res-research/50 text-res-research",
  hand: "border-accent/50 bg-accent-wash text-accent",
  drawable: "border-edge text-ink-2",
  locked: "border-edge text-ink-4",
} as const;

/** The camera zoomed by f about a point on the canvas, within ZOOM. */
const zoomed = (
  c: { x: number; y: number; k: number },
  f: number,
  cx: number,
  cy: number,
) => {
  const k = Math.min(ZOOM.max, Math.max(ZOOM.min, c.k * f));
  return { k, x: cx - ((cx - c.x) * k) / c.k, y: cy - ((cy - c.y) * k) / c.k };
};

const topCentre = (map: HTMLElement, self: HTMLElement) => ({
  x: Math.max(0, (map.clientWidth - self.offsetWidth) / 2),
  y: 16,
});

export function TechTree(props: {
  conn: MatchConnection;
  content: ContentLookups;
  onClose: () => void;
}) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  const fields = fieldsOf(content);
  const [field, setField] = useState(fields[0]?.id ?? "");
  const canvas = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const techs = view ? treeTechs(content, view, field) : [];
  const at = treeLayout(techs);
  const pos = (id: string) => {
    const p = at.get(id) ?? { col: 0, row: 0 };
    return { x: p.col * (W + GX), y: p.row * (H + GY) };
  };
  const width = Math.max(1, ...techs.map((t) => pos(t.id).x + W));
  const height = Math.max(1, ...techs.map((t) => pos(t.id).y + H));

  const fit = () => {
    const el = canvas.current;
    if (!el) return;
    const k = Math.min(
      1,
      (el.clientWidth - 40) / width,
      (el.clientHeight - 40) / height,
    );
    setCam({
      k,
      x: (el.clientWidth - width * k) / 2,
      y: (el.clientHeight - height * k) / 2,
    });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: frame each field as it opens
  useLayoutEffect(fit, [field]);

  const zoom = (f: number, cx: number, cy: number) =>
    setCam((c) => zoomed(c, f, cx, cy));
  // The wheel listener isn't passive, so it can stop the page scrolling.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setCam((c) => zoomed(c, f, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  // Tabbing to a card off-screen brings it into view.
  const reveal = (id: string) => {
    const el = canvas.current;
    if (!el) return;
    const p = pos(id);
    const sx = cam.x + p.x * cam.k;
    const sy = cam.y + p.y * cam.k;
    if (
      sx >= 0 &&
      sy >= 0 &&
      sx + W * cam.k <= el.clientWidth &&
      sy + H * cam.k <= el.clientHeight
    )
      return;
    setCam((c) => ({
      ...c,
      x: el.clientWidth / 2 - (p.x + W / 2) * c.k,
      y: el.clientHeight / 2 - (p.y + H / 2) * c.k,
    }));
  };

  if (!view) return null;
  const ids = new Set(techs.map((t) => t.id));
  const held = heldTechs(view);
  const planets = content.maps.get(view.map)?.planets ?? [];
  const planetName = (id: string) =>
    planets.find((p) => p.id === id)?.name ?? id;
  const faction = view.players[view.you]?.faction;
  const factionName = content.factions.get(faction ?? "")?.name ?? "";
  const tool =
    "border-edge bg-raised text-ink-2 h-7 min-w-7.5 rounded border px-2 text-[13px]";

  return (
    <Floating
      label="Tech tree"
      title={
        <h2 className="font-display text-lg font-semibold">
          Tech tree · {factionName}
        </h2>
      }
      start={topCentre}
      remember="techtree"
      onClose={props.onClose}
      className="w-210"
    >
      <div
        role="tablist"
        aria-label="Research fields"
        className="border-line flex gap-1 border-b px-3.5 pt-2"
      >
        {fields.map((f) => {
          const mine = treeTechs(content, view, f.id);
          const on = f.id === field;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setField(f.id)}
              className={cn(
                "font-display flex items-center gap-2 rounded-t-md border-0 border-b-2 border-transparent bg-transparent px-3 py-1.5 text-[13.5px] font-semibold",
                on ? "bg-raised text-ink" : "text-ink-3",
              )}
              style={on ? { borderBottomColor: f.colour } : undefined}
            >
              <FieldIcon content={content} field={f.id} size="size-4" />
              {f.name}
              <span className="text-ink-4 font-mono text-[11px] font-normal">
                {mine.filter((t) => held.has(t.id)).length}/{mine.length}
              </span>
            </button>
          );
        })}
      </div>
      {/* Drag to pan, wheel to zoom: mouse and keyboard only, no touch. */}
      <div
        ref={canvas}
        role="tabpanel"
        className="bg-well relative h-120 cursor-grab overflow-hidden bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-size-[22px_22px] active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX - cam.x, y: e.clientY - cam.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d)
            setCam((c) => ({ ...c, x: e.clientX - d.x, y: e.clientY - d.y }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`,
          }}
        >
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            className="absolute overflow-visible"
          >
            {techs.flatMap((t) =>
              (t.requires?.techs ?? [])
                .filter((r) => ids.has(r))
                .map((r) => {
                  const a = pos(r);
                  const b = pos(t.id);
                  const ax = a.x + W;
                  const ay = a.y + H / 2;
                  const by = b.y + H / 2;
                  const mx = (ax + b.x) / 2;
                  return (
                    <path
                      key={`${r}-${t.id}`}
                      d={`M${ax} ${ay}C${mx} ${ay} ${mx} ${by} ${b.x} ${by}`}
                      fill="none"
                      stroke="var(--color-edge)"
                      strokeWidth={2}
                    />
                  );
                }),
            )}
          </svg>
          {techs.map((t) => (
            <TechCard
              key={t.id}
              content={content}
              tech={t}
              status={treeStatus(content, view, t.id)}
              cost={techCost(content, held, t.id)}
              now={now}
              planetName={planetName}
              at={pos(t.id)}
              onFocus={() => reveal(t.id)}
            />
          ))}
        </div>
        <div className="absolute right-2.5 bottom-2.5 flex gap-1">
          <button type="button" className={tool} onClick={fit}>
            Fit
          </button>
          {(
            [
              ["+", "Zoom in", 1.2],
              ["−", "Zoom out", 1 / 1.2],
            ] as const
          ).map(([text, name, f]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              className={tool}
              onClick={() => {
                const el = canvas.current;
                if (el) zoom(f, el.clientWidth / 2, el.clientHeight / 2);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </Floating>
  );
}

function TechCard(props: {
  content: ContentLookups;
  tech: Tech;
  status: TreeStatus;
  cost: number;
  now: number;
  planetName: (id: string) => string;
  at: { x: number; y: number };
  onFocus: () => void;
}) {
  const { content, tech: t, status: s } = props;
  const colour = `var(--color-rarity-${t.rarity}, var(--color-ink-3))`;
  const progress =
    s.kind === "researching"
      ? projectDone(s.project, props.now) / s.project.cost
      : s.kind === "saved"
        ? s.done / s.cost
        : null;
  const chip = {
    held: () =>
      `Held · ${s.kind === "held" ? s.planets.map(props.planetName).join(", ") : ""}`,
    researching: () => `Researching ${Math.floor((progress ?? 0) * 100)}%`,
    saved: () => `Saved ${Math.floor((progress ?? 0) * 100)}%`,
    hand: () => "In hand",
    drawable: () => "Can be drawn",
    locked: () => "Locked",
  }[s.kind]();
  const does = techText(content, t);
  return (
    <InfoPopover
      side="right"
      align="start"
      content={
        <div className="flex w-72 flex-col gap-1.5">
          <span className="font-display text-base font-semibold">{t.name}</span>
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase"
            style={{ color: colour }}
          >
            {t.rarity} · {content.rules.tech.fields[t.field]?.name ?? t.field}
          </span>
          {does && <p className="text-ink-2 m-0 text-[12.5px]">{does}.</p>}
          <span className="text-ink-3 font-mono text-xs">
            {props.cost} Research to research now
          </span>
          {s.kind === "locked" && s.needs.length > 0 && (
            <span className="text-accent text-xs">
              Needs {s.needs.join(", ")}
            </span>
          )}
          <span className="text-ink-3 text-xs">{chip}</span>
        </div>
      }
    >
      <button
        type="button"
        onFocus={props.onFocus}
        className={cn(
          "bg-item border-line absolute flex flex-col gap-1 overflow-hidden rounded-md border border-l-3 px-2.5 py-2 text-left",
          s.kind === "held" && "border-ok-edge bg-ok-wash/60",
          s.kind === "locked" && "opacity-55",
        )}
        style={{
          left: props.at.x,
          top: props.at.y,
          width: W,
          height: H,
          borderLeftColor: colour,
        }}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold">{t.name}</span>
          <span
            className="flex-none font-mono text-[10px] uppercase"
            style={{ color: colour }}
          >
            {t.rarity}
          </span>
        </span>
        <span className="text-ink-2 line-clamp-2 text-xs">
          {s.kind === "locked" && s.needs.length ? (
            <span className="text-accent">Needs {s.needs.join(", ")}</span>
          ) : (
            does
          )}
        </span>
        <span className="flex-1" />
        {progress !== null && (
          <span className="bg-well block h-0.75 overflow-hidden rounded-sm">
            <span
              className="bg-res-research block h-full"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        )}
        <span className="flex items-center justify-between gap-2 font-mono text-[11px]">
          <span className="text-res-research">◆ {props.cost}</span>
          <span
            className={cn(
              "truncate rounded-full border px-1.5 text-[10.5px]",
              CHIP[s.kind],
            )}
          >
            {chip}
          </span>
        </span>
      </button>
    </InfoPopover>
  );
}
