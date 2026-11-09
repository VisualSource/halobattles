import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import type { Battlefield, Cell, DefenceLayout } from "./store";
import { Floating, label, useSelectedPlanet, windowTitle } from "./windows";

const STACKS = ["I", "II", "III"];
const LZ = "ABCDEFGH";

const topCentre = (map: HTMLElement, self: HTMLElement) => ({
  x: Math.max(0, (map.clientWidth - self.offsetWidth) / 2),
  y: 16,
});

const near = (a: Cell, b: Cell, r: number) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;

/** The Battlefield's terrain as an image, a pixel a cell, lighter per height level. */
function useTerrain(field: Battlefield, content: ContentLookups) {
  return useMemo(() => {
    const { width: w, height: h } = field;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx || w === 0) return "";
    for (let i = 0; i < w * h; i++) {
      const lift = 12 * (field.heights[i] ?? 0);
      const id = field.terrains[field.terrain[i] ?? 0] ?? "";
      ctx.fillStyle = content.terrains.get(id)?.colour ?? "#555555";
      ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
      if (lift) {
        ctx.fillStyle = `rgb(255 255 255 / ${lift}%)`;
        ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
      }
    }
    return canvas.toDataURL();
  }, [field, content]);
}

/**
 * Your selected Planet's defence layout, like the Battle window: the
 * Battlefield you'd defend it on, where your buildings stand on the base's
 * sites and where each Stack starts. Drag a building to another site (onto a
 * taken one swaps them), or a Stack onto ground near the Command Post or one
 * of your buildings. Changes apply to the next Battle there.
 */
export function LayoutWindow(props: {
  conn: MatchConnection;
  content: ContentLookups;
  onClose: () => void;
}) {
  const { conn, content } = props;
  const sel = useSelectedPlanet(conn, content);
  const layout = useStore(conn.local, (s) => s.layout);
  const pending = useStore(conn.local, (s) => isPending(s, "layout"));
  const planet = sel?.mine ? sel.planet : undefined;
  // Asked again when its buildings change: a new one takes a free site.
  const buildings = planet?.buildings.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildings is the trigger
  useEffect(() => {
    if (sel?.mine) conn.requestLayout(sel.id);
  }, [conn, sel?.id, sel?.mine, buildings]);

  const shown = layout && layout.planet === sel?.id ? layout : null;
  return (
    <Floating
      label={sel ? `${sel.name}: Defence layout` : "Defence layout"}
      start={topCentre}
      remember="layout"
      onClose={props.onClose}
      className="w-200"
      title={
        <h2 className={windowTitle}>
          {sel?.mine ? `${sel.name}: Defence layout` : "Defence layout"}
        </h2>
      }
      tools={
        shown &&
        planet && (
          <button
            type="button"
            disabled={
              pending ||
              planet.locked ||
              (shown.setSites.every((k) => k === null) &&
                shown.setStarts.size === 0 &&
                shown.setPost === null)
            }
            onClick={() => conn.setLayout(shown.planet, [], new Map())}
            className="border-edge bg-raised min-h-7 rounded px-2.5 text-xs disabled:opacity-50"
          >
            Reset to default
          </button>
        )
      }
    >
      <p className="text-ink-2 border-edge border-b px-4 py-2 text-xs">
        {!sel?.mine
          ? "Select one of your Planets to lay out its defence."
          : planet?.locked
            ? "Locked by a Battle: the layout can change once it's over."
            : "Drag a building or your Command Post to another site, or a Stack to where it starts the Battle. Changes apply to the next Battle here."}
      </p>
      <div className="flex h-118">
        {shown && planet ? (
          <LayoutMap
            content={content}
            onChange={(sites, starts, post) =>
              conn.setLayout(shown.planet, sites, starts, post)
            }
            layout={shown}
            buildings={planet.buildings}
            editable={!planet.locked && !pending}
          />
        ) : (
          <div className="border-edge my-2.5 ml-4 flex-1 rounded-md border" />
        )}
        <aside
          aria-label="What's placed"
          className="flex w-55 flex-none flex-col gap-2 overflow-y-auto px-4 py-2.5"
        >
          <span className={label}>Buildings</span>
          <ul className="flex flex-col gap-1 text-sm">
            {planet?.buildings.map((id, slot) =>
              id ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: Building Slots are positional
                <li key={slot} className="flex items-center gap-2">
                  <span className="text-ink-3 w-5 font-mono text-xs">
                    {siteLabel(shown?.buildingSites[slot])}
                  </span>
                  {content.buildings.get(id)?.name ?? id}
                </li>
              ) : null,
            )}
          </ul>
          <span className={`${label} mt-2`}>Stacks</span>
          <ul className="flex flex-col gap-1 text-sm">
            {planet?.stacks.map((st, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the three Stacks are positional
              <li key={k} className="flex items-baseline gap-2">
                <span className="text-ink-3 w-5 font-mono text-xs">
                  {STACKS[k]}
                </span>
                <span className="min-w-0 flex-1">
                  {st.length === 0
                    ? "Empty"
                    : st
                        .map(
                          (u) =>
                            `${content.units.get(u.unit)?.name ?? u.unit} × ${u.count}`,
                        )
                        .join(", ")}
                  {shown?.setStarts.has(k) && (
                    <span className="text-host ml-1.5 text-[11px]">moved</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Floating>
  );
}

const siteLabel = (k: number | null | undefined) =>
  k === null || k === undefined ? "CP" : String(k + 1);

/**
 * Each Building Slot's site after moving slot's building to site k: every
 * building pinned where it stands, and one already on k swapped to slot's old
 * site. null when there's nothing to move.
 */
export function moveBuilding(
  sites: (number | null)[],
  slot: number,
  k: number,
): (number | null)[] | null {
  const from = sites[slot] ?? null;
  if (k < 0 || k === from) return null;
  const out = [...sites];
  const other = out.indexOf(k);
  out[slot] = k;
  if (other >= 0) out[other] = from;
  return out;
}

type Drag =
  | { kind: "building"; slot: number; at: Cell }
  | { kind: "post"; at: Cell } // the Command Post (#124)
  | { kind: "stack"; stack: number; at: Cell };

/**
 * A defence layout's Battlefield, to drag buildings between sites and Stacks
 * to their starts; onChange gets the whole layout after each drop. The
 * Layout window's, and the Lab's.
 */
export function LayoutMap(props: {
  content: ContentLookups;
  layout: DefenceLayout;
  buildings: string[];
  editable: boolean;
  onChange: (
    sites: (number | null)[],
    starts: Map<number, Cell>,
    post: number | null,
  ) => void;
}) {
  const { content, layout: l, onChange } = props;
  const terrain = useTerrain(l.field, content);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const { width: w, height: h } = l.field;

  // Where a Stack may start: near the Command Post or a site with a building.
  const held = [
    l.commandPost,
    ...l.buildingSites.flatMap((k) => (k === null ? [] : [l.sites[k]])),
  ].filter((c): c is Cell => !!c);
  const cellAt = (e: React.PointerEvent): Cell => {
    const m = svg.current?.getScreenCTM()?.inverse();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return {
      x: Math.min(w - 1, Math.max(0, Math.floor(p.x))),
      y: Math.min(h - 1, Math.max(0, Math.floor(p.y))),
    };
  };
  // The site a building dropped at c lands on: the nearest within 3 cells.
  const siteNear = (c: Cell) => {
    let best = -1;
    l.sites.forEach((s, k) => {
      const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2;
      const b = l.sites[best];
      if (d <= 9 && (!b || d < (b.x - c.x) ** 2 + (b.y - c.y) ** 2)) best = k;
    });
    return best;
  };
  const buildingName = (slot: number) => {
    const id = props.buildings[slot] ?? "";
    return content.buildings.get(id)?.name ?? id;
  };

  const drop = (d: Drag) => {
    setDrag(null);
    if (d.kind === "building") {
      const k = siteNear(d.at);
      const sites = moveBuilding(l.buildingSites, d.slot, k);
      // Onto the Command Post's site: it swaps, to the building's old one.
      const post =
        k === l.setPost ? (l.buildingSites[d.slot] ?? null) : l.setPost;
      if (sites) onChange(sites, l.setStarts, post);
      return;
    }
    if (d.kind === "post") {
      const k = siteNear(d.at);
      if (k < 0 || k === l.setPost) return;
      // A building there swaps to where the Command Post stood: its site, or
      // its own default if it stood at the base's own spot.
      const sites = [...l.buildingSites];
      const other = sites.indexOf(k);
      if (other >= 0) sites[other] = l.setPost;
      onChange(sites, l.setStarts, k);
      return;
    }
    if (!held.some((c) => near(c, d.at, l.reach))) {
      setRefused("Too far from your base");
      return;
    }
    onChange(l.setSites, new Map(l.setStarts).set(d.stack, d.at), l.setPost);
  };

  const grab = (e: React.PointerEvent, d: Drag) => {
    if (!props.editable) return;
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    setRefused(null);
    setDrag(d);
  };
  const stackAt = (k: number) =>
    drag?.kind === "stack" && drag.stack === k ? drag.at : l.stackStarts[k];
  const slotOnSite = (k: number) => l.buildingSites.indexOf(k);
  const onSite = drag?.kind === "building" || drag?.kind === "post";
  const target = onSite ? siteNear(drag.at) : -1;
  const from =
    drag?.kind === "building"
      ? (l.buildingSites[drag.slot] ?? null)
      : drag?.kind === "post"
        ? l.setPost
        : null;
  // What the drop would do, or why the last one was refused.
  const note = (() => {
    if (onSite) {
      const name =
        drag.kind === "building" ? buildingName(drag.slot) : "Command Post";
      if (target < 0 || target === from)
        return `Moving the ${name}: drop it on a lit site`;
      const other = slotOnSite(target);
      if (other >= 0 && drag.kind === "post")
        return `Swap the Command Post with ${buildingName(other)}`;
      if (target === l.setPost) return `Swap ${name} with the Command Post`;
      return other >= 0
        ? `Swap ${name} with ${buildingName(other)}`
        : `${name} → site ${target + 1}`;
    }
    if (drag?.kind === "stack")
      return `Stack ${STACKS[drag.stack]}: start it in the lit ground`;
    return refused;
  })();

  return (
    <div className="border-edge relative my-2.5 ml-4 flex-1 overflow-hidden rounded-md border">
      <svg
        ref={svg}
        viewBox={`0 0 ${w} ${h}`}
        className="block size-full touch-none select-none"
        role="img"
        aria-label="The Battlefield you'd defend this Planet on: your base, its building sites and your Stacks' starts"
        onPointerMove={(e) => drag && setDrag({ ...drag, at: cellAt(e) })}
        onPointerUp={() => drag && drop(drag)}
        onPointerCancel={() => setDrag(null)}
      >
        <image
          href={terrain}
          width={w}
          height={h}
          style={{ imageRendering: "pixelated" }}
        />
        {onSite &&
          l.sites.map((s, k) =>
            k === from ? null : (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: sites are positional
                key={k}
                cx={s.x + 0.5}
                cy={s.y + 0.5}
                r={2.6}
                fill="var(--color-accent)"
                fillOpacity={k === target ? 0.8 : 0.5}
                stroke="var(--color-highlight)"
                strokeWidth={k === target ? 0.35 : 0.15}
              />
            ),
          )}
        {drag?.kind === "stack" &&
          held.map((c) => (
            <circle
              key={`${c.x},${c.y}`}
              cx={c.x + 0.5}
              cy={c.y + 0.5}
              r={l.reach}
              fill="var(--color-accent)"
              fillOpacity={0.35}
            />
          ))}
        <g opacity={0.75}>
          {l.points.map((p, i) => (
            <g key={`${p.x},${p.y}`}>
              <circle
                cx={p.x + 0.5}
                cy={p.y + 0.5}
                r={2.5}
                fill="none"
                stroke="var(--color-ink-3)"
                strokeWidth={0.25}
                strokeDasharray="0.6 0.6"
              />
              <text
                x={p.x + 0.5}
                y={p.y + 0.9}
                fontSize={1.2}
                textAnchor="middle"
                fill="var(--color-ink-2)"
                className="font-mono"
              >
                LZ {LZ[i]}
              </text>
            </g>
          ))}
          {l.pads.map((p) => (
            <rect
              key={`${p.x},${p.y}`}
              x={p.x + 0.1}
              y={p.y + 0.1}
              width={0.8}
              height={0.8}
              transform={`rotate(45 ${p.x + 0.5} ${p.y + 0.5})`}
              fill="none"
              stroke="var(--color-ink-2)"
              strokeWidth={0.15}
            />
          ))}
        </g>
        {/* The Command Post: dragged onto a building site (#124). */}
        <rect
          x={(drag?.kind === "post" ? drag.at : l.commandPost).x - 0.3}
          y={(drag?.kind === "post" ? drag.at : l.commandPost).y - 0.3}
          width={1.6}
          height={1.6}
          fill="var(--color-accent)"
          fillOpacity={drag?.kind === "post" ? 0.7 : 1}
          stroke="#000"
          strokeWidth={0.15}
          className={props.editable ? "cursor-grab" : ""}
          onPointerDown={(e) =>
            grab(e, { kind: "post", at: { ...l.commandPost } })
          }
        >
          <title>Your Command Post. Drag it onto a building site.</title>
        </rect>
        {l.sites.map((s, k) => {
          const slot = slotOnSite(k);
          const lit = k === target && k !== from;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: sites are positional
            <g key={k}>
              <rect
                x={s.x - 0.6}
                y={s.y - 0.6}
                width={2.2}
                height={2.2}
                rx={0.25}
                fill={slot >= 0 ? "var(--color-accent-wash)" : "none"}
                stroke={
                  lit
                    ? "var(--color-highlight)"
                    : slot >= 0
                      ? "var(--color-accent)"
                      : "var(--color-ink-3)"
                }
                strokeWidth={lit ? 0.3 : 0.18}
                strokeDasharray={slot >= 0 ? undefined : "0.5 0.4"}
                className={slot >= 0 && props.editable ? "cursor-grab" : ""}
                onPointerDown={(e) =>
                  slot >= 0 && grab(e, { kind: "building", slot, at: { ...s } })
                }
              >
                <title>
                  {slot >= 0
                    ? `Site ${k + 1}: ${buildingName(slot)}. Drag it to another site.`
                    : `Site ${k + 1}: free`}
                </title>
              </rect>
              <text
                x={s.x + 0.5}
                y={s.y + 0.95}
                fontSize={1.1}
                textAnchor="middle"
                fill="var(--color-ink)"
                className="pointer-events-none font-mono"
              >
                {k + 1}
              </text>
              {slot >= 0 && (
                // Its building's name, so a move or a swap shows on the map.
                <text
                  x={s.x + 0.5}
                  y={s.y + 2.7}
                  fontSize={0.9}
                  textAnchor="middle"
                  fill="var(--color-ink-bright)"
                  stroke="#000"
                  strokeWidth={0.25}
                  paintOrder="stroke"
                  className="pointer-events-none"
                >
                  {buildingName(slot)}
                </text>
              )}
            </g>
          );
        })}
        {drag?.kind === "building" && from !== null && l.sites[from] && (
          // The building, following the pointer from its site.
          <g className="pointer-events-none">
            <line
              x1={(l.sites[from]?.x ?? 0) + 0.5}
              y1={(l.sites[from]?.y ?? 0) + 0.5}
              x2={drag.at.x + 0.5}
              y2={drag.at.y + 0.5}
              stroke="var(--color-highlight)"
              strokeWidth={0.15}
              strokeDasharray="0.5 0.4"
            />
            <rect
              x={drag.at.x - 0.6}
              y={drag.at.y - 0.6}
              width={2.2}
              height={2.2}
              rx={0.25}
              fill="var(--color-accent)"
              fillOpacity={0.6}
              stroke="var(--color-highlight)"
              strokeWidth={0.2}
            />
          </g>
        )}
        {STACKS.map((name, k) => {
          const at = stackAt(k);
          if (!at) return null;
          const dragging = drag?.kind === "stack" && drag.stack === k;
          return (
            <g
              key={name}
              className={props.editable ? "cursor-grab" : ""}
              onPointerDown={(e) =>
                grab(e, { kind: "stack", stack: k, at: { ...at } })
              }
            >
              {/* The Stack's 5 × 3 formation round its start. */}
              <rect
                x={at.x - 2}
                y={at.y - 1}
                width={5}
                height={3}
                rx={0.4}
                fill="var(--color-accent)"
                fillOpacity={dragging ? 0.35 : 0.2}
                stroke={
                  dragging ? "var(--color-highlight)" : "var(--color-ink)"
                }
                strokeWidth={0.15}
                strokeDasharray="0.4 0.3"
              />
              <text
                x={at.x + 0.5}
                y={at.y + 0.9}
                fontSize={1.2}
                textAnchor="middle"
                fill="var(--color-ink)"
                className="pointer-events-none font-mono"
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      {note && (
        <div className="bg-panel/80 border-edge text-ink-2 pointer-events-none absolute bottom-2.5 left-2.5 rounded border px-2 py-1 text-xs">
          {note}
        </div>
      )}
    </div>
  );
}
