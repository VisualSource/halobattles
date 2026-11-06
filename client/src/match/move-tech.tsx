import { useEffect } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { LabRows } from "./research";
import { CostIcons } from "./resources";
import { laneTimes, route } from "./route";
import { routeOwner } from "./store";
import { labs, otherLabs } from "./tech";
import { useMatchNow } from "./time";
import {
  besidePlanet,
  Floating,
  label,
  planetNameOn,
  windowTitle,
} from "./windows";

/** "38 s", "1 m 12 s" */
function duration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} m ${s % 60} s`;
}

/**
 * Where to move a held Tech, or send on a Courier that's already carrying
 * one: your other Labs with how long each takes. Picking one sends it at once.
 */
export function MoveTechWindow(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const moving = useStore(conn.local, (s) => s.moving);
  const view = useStore(conn.store, (s) => s.view);
  const lastSeen = useStore(conn.local, (s) => s.lastSeen);
  const pending = useStore(conn.local, (s) => isPending(s, "courier"));
  const now = useMatchNow(conn.local);
  const map = view && content.maps.get(view.map);
  const army =
    moving?.army === undefined ? undefined : view?.armies.get(moving.army);
  const from = army
    ? army.to
    : view &&
      labs(content, view).find((l) => l.holds.includes(moving?.tech ?? ""))
        ?.planet;
  // Landed, lost or gone: this picker's price would be out of date.
  const stale =
    !!moving && !!view && (!from || (moving.army !== undefined && !army));
  useEffect(() => {
    if (stale) conn.local.setState({ moving: null });
  }, [stale, conn]);
  if (!moving || !view || !map || view.spectating || !from || stale)
    return null;
  const { tech } = moving;

  const close = () => conn.local.setState({ moving: null });
  const name = content.techs.get(tech)?.name ?? tech;
  const cost = army
    ? {}
    : (content.rules.techTransferCost[content.techs.get(tech)?.rarity ?? ""] ??
      {});
  const afford = Object.entries(cost).every(
    ([r, n]) => (view.economy.resources.get(r) ?? 0) >= n,
  );
  const lanes = laneTimes(map, content.rules);
  const planetName = (id: string) => planetNameOn(map, id);
  const owner = (id: string) => routeOwner(view, lastSeen, id);
  // The server refuses a route into a Planet you know is an enemy's.
  const enemy = (id: string) => ![null, view.you].includes(owner(id));
  const trip = (to: string) => {
    const t = route(
      lanes,
      owner,
      view.you,
      from,
      to,
      content.rules.ownLaneTime,
    );
    return t && !t.path.slice(1).some(enemy) ? t : null;
  };
  // A Courier finishes its Lane hop first.
  const hop = army && !army.waiting ? army.arrives - now : 0;
  const locked = !army && view.planets.get(from)?.locked;

  return (
    <Floating
      label={`Move ${name}`}
      start={besidePlanet}
      remember="move-tech"
      onClose={close}
      className="w-95"
      title={
        <h2 className={`${windowTitle} truncate`}>{name}: to which Lab?</h2>
      }
    >
      {/* A fixed height, with the list scrolling inside it. */}
      <div className="flex h-100 flex-col">
        <div className="border-line bg-well flex flex-none items-center gap-2.5 border-b px-3.5 py-2 text-sm">
          <span className={label}>Cost</span>
          {army ? (
            <span className="text-ink-3 text-xs">No extra cost</span>
          ) : (
            <>
              <span
                className={`font-mono text-xs ${afford ? "" : "text-danger"}`}
              >
                <CostIcons content={content} cost={cost} />
              </span>
              <span className="text-ink-3 ml-auto text-xs">No refunds</span>
            </>
          )}
        </div>
        <LabRows
          content={content}
          labs={otherLabs(content, view, tech)}
          blocked={(l) => pending || !afford || !!locked || !trip(l.planet)}
          planetName={planetName}
          time={(l) => {
            const t = trip(l.planet);
            return t ? duration(hop + t.ms) : "no safe route";
          }}
          onPick={(l) => {
            if (army) conn.reorderCourier(army.id, l.planet, l.slot);
            else conn.sendTech(tech, l.planet, l.slot);
            close();
          }}
        />
        <p className="text-ink-3 flex-none px-3.5 pt-1 pb-3 text-xs">
          It doesn't count while it's on the way, and it's lost if it reaches an
          enemy's Planet.
        </p>
      </div>
    </Floating>
  );
}
