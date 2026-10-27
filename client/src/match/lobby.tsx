import { Link } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { Faction, GalaxyMap } from "../gen/content";
import { seatColour } from "../scene/galaxy";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import type { Lobby } from "./store";

const byId = <T,>(m: Map<string, T>) =>
  [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const sectionTitle =
  "font-display font-semibold text-base text-ink-2 tracking-[0.08em]";

export function LobbyScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
  matchId: string;
  userId: string;
}) {
  const { conn, content, userId } = props;
  const lobby = useStore(conn.store, (s) => s.lobby);
  const local = useStore(conn.local);
  const [dialog, setDialog] = useState<"map" | "faction" | null>(null);
  if (!lobby) return <p className="p-8">Joining…</p>;

  const map = content.maps.get(lobby.map);
  const me = lobby.seats.find((s) => s.user === userId);
  const isHost = lobby.host === userId;
  const canStart =
    isHost &&
    lobby.seats.every((s) => s.ready || s.user === lobby.host) &&
    lobby.seats.length >= (map?.minPlayers ?? Number.POSITIVE_INFINITY);

  return (
    <>
      <div className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
              PRE-MATCH LOBBY
            </p>
            <h2 className="font-display font-semibold text-4xl">
              {lobby.seats.length} of {map?.starts.length ?? "?"} Seats filled
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Invite matchId={props.matchId} />
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-md border border-edge px-4 font-medium text-ink-2 hover:no-underline"
            >
              Leave lobby
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Seats lobby={lobby} content={content} map={map} userId={userId} />
            {me && (
              <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-panel p-5">
                <h2 className={sectionTitle}>YOUR FACTION</h2>
                <FactionButton
                  faction={content.factions.get(me.faction)}
                  pending={isPending(local, "faction")}
                  onClick={() => setDialog("faction")}
                />
                {!isHost && (
                  <p className="text-ink-3 text-sm">
                    Changing your Faction clears your ready flag.
                  </p>
                )}
              </section>
            )}
          </div>

          <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-5 rounded-[10px] border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className={sectionTitle}>MATCH SETTINGS</h2>
              {!isHost && <span className="text-ink-3 text-xs">Host only</span>}
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-ink-2 text-sm">Map</span>
              {map && (
                <MapRow
                  map={map}
                  disabled={!isHost || isPending(local, "map")}
                  trailing={
                    isHost && <span className="text-ink-3 text-sm">Change</span>
                  }
                  onClick={() => setDialog("map")}
                />
              )}
            </div>
            <StartingResources
              conn={conn}
              content={content}
              current={lobby.startingResources}
              disabled={!isHost}
              pending={isPending(local, "startingResources")}
            />
          </section>
        </div>
      </div>

      <footer className="sticky bottom-0 border-line border-t bg-bar">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-8 py-4">
          <p className="text-ink-2">{status(lobby, map, userId)}</p>
          {isHost ? (
            <button
              type="button"
              disabled={!canStart || isPending(local, "start")}
              onClick={() => conn.startMatch()}
              className="min-h-13 min-w-50 rounded-lg border-0 bg-accent px-7 font-bold font-display text-accent-ink text-lg tracking-[0.12em] disabled:bg-line disabled:text-ink-4 disabled:opacity-100"
            >
              START MATCH
            </button>
          ) : (
            me && (
              <label
                className={`inline-flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border px-6 font-bold font-display text-lg tracking-[0.12em] ${me.ready ? "border-ok-edge bg-ok-wash text-ok" : "border-edge bg-raised"}`}
              >
                <input
                  type="checkbox"
                  checked={me.ready}
                  disabled={isPending(local, "ready")}
                  onChange={(e) => conn.setReady(e.target.checked)}
                  className="size-5.5 accent-accent"
                />
                READY
              </label>
            )
          )}
        </div>
      </footer>

      <Dialog
        open={dialog === "map"}
        onClose={() => setDialog(null)}
        label="maps-title"
        className="m-auto max-h-[80vh] w-full max-w-lg rounded-xl border border-edge bg-panel text-ink"
      >
        <MapPicker
          content={content}
          current={lobby.map}
          seated={lobby.seats.length}
          onPick={(id) => {
            if (id !== lobby.map) conn.setMap(id);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      </Dialog>
      {me && (
        <Dialog
          open={dialog === "faction"}
          onClose={() => setDialog(null)}
          label="factions-title"
          className="m-0 h-screen max-h-none w-screen max-w-none bg-void text-ink"
        >
          <FactionPicker
            content={content}
            current={me.faction}
            warnUnready={!isHost && me.ready}
            onPick={(id) => {
              if (id !== me.faction) conn.setFaction(id);
              setDialog(null);
            }}
            onClose={() => setDialog(null)}
          />
        </Dialog>
      )}
    </>
  );
}

function status(lobby: Lobby, map: GalaxyMap | undefined, userId: string) {
  const me = lobby.seats.find((s) => s.user === userId);
  if (lobby.host !== userId) {
    return me?.ready
      ? "You're ready. Waiting for the Host to start."
      : "Ready up once you've picked your Faction.";
  }
  const short = (map?.minPlayers ?? 0) - lobby.seats.length;
  if (short > 0) return `Waiting for ${plural(short, "more player")}.`;
  const notReady = lobby.seats.filter(
    (s) => s.user !== lobby.host && !s.ready,
  ).length;
  if (notReady > 0)
    return `Waiting on ${plural(notReady, "player")} to ready up.`;
  return "Everyone is ready. You can start the match.";
}

function Invite(props: { matchId: string }) {
  const [copied, setCopied] = useState(false);
  // The URL is the invite. The clipboard needs a secure context.
  const copy = () =>
    navigator.clipboard
      ?.writeText(location.href)
      .then(() => setCopied(true))
      .catch(() => {});
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel py-1.5 pr-1.5 pl-4">
      <span className="text-ink-3 text-sm">Invite</span>
      <code className="font-mono text-sm">{props.matchId}</code>
      <button
        type="button"
        onClick={copy}
        className="min-h-11 rounded-md border-0 bg-raised px-3 font-medium text-sm"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function Seats(props: {
  lobby: Lobby;
  content: ContentLookups;
  map: GalaxyMap | undefined;
  userId: string;
}) {
  const { lobby, content } = props;
  const open = Math.max(
    0,
    (props.map?.starts.length ?? 0) - lobby.seats.length,
  );
  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-panel">
      <h2 className={`${sectionTitle} border-line border-b px-5 py-4`}>
        SEATS
      </h2>
      <ol>
        {lobby.seats.map((s, i) => {
          const host = s.user === lobby.host;
          const me = s.user === props.userId;
          return (
            <li
              key={s.user}
              className={`flex min-h-18 items-center gap-4 border-divider border-b px-5 ${me ? "bg-highlight" : ""}`}
            >
              <span
                aria-hidden="true"
                className="h-10 w-1.5 rounded-sm"
                style={{ background: seatColour(i) }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {s.displayName || "(no name)"}
                  </span>
                  {me && <span className="text-ink-3 text-xs">(you)</span>}
                  {host && (
                    <span className="rounded bg-host-wash px-2 py-0.5 font-semibold text-host text-[11px] tracking-widest">
                      HOST
                    </span>
                  )}
                </div>
                <span className="text-ink-3 text-sm">
                  {content.factions.get(s.faction)?.name ?? s.faction}
                </span>
              </div>
              {!host && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-sm ${s.ready ? "bg-ok-wash text-ok" : "bg-idle-wash text-idle"}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-current"
                  />
                  {s.ready ? "Ready" : "Not ready"}
                </span>
              )}
            </li>
          );
        })}
        {Array.from({ length: open }, (_, i) => `open-${i}`).map((key) => (
          <li
            key={key}
            className="flex min-h-18 items-center gap-4 border-divider border-b px-5"
          >
            <span
              aria-hidden="true"
              className="h-10 w-1.5 rounded-sm bg-open-seat"
            />
            <span className="text-ink-4 italic">
              Open Seat · waiting for a player
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A modal <dialog>, which brings focus trapping and Escape to close. */
function Dialog(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (props.open && !d?.open) d?.showModal();
    if (!props.open && d?.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      onClose={props.onClose}
      aria-labelledby={props.label}
      className={`p-0 backdrop:bg-scrim/70 ${props.className}`}
    >
      {props.open && props.children}
    </dialog>
  );
}

function CloseButton(props: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border-edge bg-transparent px-4 font-medium text-ink-2"
    >
      {props.children ?? "Close"}
    </button>
  );
}

/** The map's Planets and Lanes in miniature, with its starts in the accent. */
function MapGlyph(props: { map: GalaxyMap }) {
  const { planets, lanes, starts } = props.map;
  const xs = planets.map((p) => p.position.x);
  const ys = planets.map((p) => p.position.y);
  const size = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    1,
  );
  const pad = size * 0.12;
  const at = new Map(planets.map((p) => [p.id, p.position]));
  const isStart = new Set(starts);
  return (
    <svg
      aria-hidden="true"
      className="size-10"
      viewBox={`${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${size + 2 * pad} ${size + 2 * pad}`}
    >
      {lanes.map((l) => {
        const a = at.get(l.from);
        const b = at.get(l.to);
        return (
          a &&
          b && (
            <line
              key={`${l.from}-${l.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--color-edge)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )
        );
      })}
      {planets.map((p) => (
        <circle
          key={p.id}
          cx={p.position.x}
          cy={p.position.y}
          r={size * (isStart.has(p.id) ? 0.075 : 0.05)}
          fill={
            isStart.has(p.id) ? "var(--color-accent)" : "var(--color-ink-3)"
          }
        />
      ))}
    </svg>
  );
}

function MapRow(props: {
  map: GalaxyMap;
  disabled?: boolean;
  selected?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  const { map } = props;
  const most = map.starts.length;
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={`flex w-full items-center gap-3.5 rounded-lg border px-3 py-2.5 text-left disabled:cursor-default ${props.selected ? "border-2 border-accent bg-accent-wash" : "border-edge bg-well"}`}
    >
      <span className="flex size-14 flex-none items-center justify-center rounded-md bg-tile">
        <MapGlyph map={map} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display font-semibold text-[17px]">
          {map.name}
        </span>
        <span className="text-ink-3 text-sm">
          {plural(map.planets.length, "Planet")}
        </span>
        <span className="text-ink-3 text-sm">
          {map.minPlayers === most
            ? plural(most, "player")
            : `${map.minPlayers}–${most} players`}
        </span>
      </span>
      {props.trailing}
    </button>
  );
}

function MapPicker(props: {
  content: ContentLookups;
  current: string;
  seated: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center justify-between gap-2 border-line border-b py-3 pr-3 pl-5">
        <h2 id="maps-title" className={sectionTitle}>
          CHOOSE A MAP
        </h2>
        <CloseButton onClick={props.onClose} />
      </div>
      <ul className="flex flex-col gap-2 overflow-y-auto p-3">
        {byId(props.content.maps).map(([id, m]) => {
          const tooSmall = m.starts.length < props.seated;
          return (
            <li key={id}>
              <MapRow
                map={m}
                selected={id === props.current}
                disabled={tooSmall}
                trailing={
                  tooSmall && (
                    <span className="text-idle text-xs">Too few starts</span>
                  )
                }
                onClick={() => props.onPick(id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Emblem(props: { faction: Faction | undefined; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-md bg-raised font-bold font-display ${props.className}`}
    >
      {props.faction?.name.slice(0, 1) ?? "?"}
    </span>
  );
}

function FactionButton(props: {
  faction: Faction | undefined;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={props.pending}
      onClick={props.onClick}
      className="flex min-h-22 w-full items-center gap-4 rounded-lg border-edge bg-well px-4 py-3 text-left"
    >
      <Emblem faction={props.faction} className="size-16 text-3xl" />
      <span className="flex-1 font-display font-semibold text-xl">
        {props.faction?.name ?? "?"}
      </span>
      <span className="font-semibold text-accent text-sm">Change</span>
    </button>
  );
}

/** Full screen: preview a Faction's starting kit, then confirm it. */
function FactionPicker(props: {
  content: ContentLookups;
  current: string;
  warnUnready: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { content } = props;
  const [preview, setPreview] = useState(props.current);
  const faction = content.factions.get(preview);
  const units = new Map<string, number>();
  for (const e of faction?.startingKit.stacks.flat() ?? []) {
    units.set(e.unit, (units.get(e.unit) ?? 0) + e.count);
  }
  const listItem = "rounded-md bg-item px-3.5 py-3 font-medium";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-line border-b bg-ground px-8 py-3">
        <h2
          id="factions-title"
          className="font-bold font-display text-xl tracking-[0.14em]"
        >
          CHOOSE YOUR FACTION
        </h2>
        <CloseButton onClick={props.onClose}>Back to lobby</CloseButton>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 items-end overflow-hidden bg-hero p-10">
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-[8%] -translate-y-1/2 font-bold font-display text-[420px] text-white/5 leading-none"
          >
            {faction?.name.slice(0, 1)}
          </span>
          <p className="relative font-bold font-display text-7xl text-ink-bright leading-none">
            {faction?.name ?? preview}
          </p>
        </div>
        <aside className="flex w-90 flex-none flex-col gap-7 overflow-y-auto border-line border-l bg-bar p-8">
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
              STARTING ARMY
            </h3>
            <ul className="flex flex-col gap-2">
              {[...units].map(([id, count]) => (
                <li
                  key={id}
                  className={`flex justify-between gap-3 ${listItem}`}
                >
                  <span>{content.units.get(id)?.name ?? id}</span>
                  <span className="font-mono text-ink-2">×{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
              STARTING BUILDINGS
            </h3>
            <ul className="flex flex-col gap-2">
              {faction?.startingKit.buildings.map((id, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a kit can repeat a building
                <li key={i} className={listItem}>
                  {content.buildings.get(id)?.name ?? id}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-5 border-line border-t bg-ground px-8 py-5">
        <div className="flex flex-wrap gap-3">
          {byId(content.factions).map(([id, f]) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === preview}
              onClick={() => setPreview(id)}
              className={`relative flex size-33 flex-col items-center justify-center gap-2 rounded-lg border-2 ${id === preview ? "border-accent bg-accent-wash" : "border-line bg-bar"}`}
            >
              <Emblem faction={f} className="size-14 text-2xl" />
              <span className="font-display font-semibold tracking-wide">
                {f.name}
              </span>
              {id === props.current && (
                <span className="absolute top-2 right-2 rounded-sm bg-line px-1.5 py-0.5 font-semibold text-[10px] text-ink-2 tracking-widest">
                  CURRENT
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => props.onPick(preview)}
            className="min-h-14 min-w-60 rounded-lg border-0 bg-accent px-8 font-bold font-display text-accent-ink text-lg tracking-[0.12em]"
          >
            PLAY AS {(faction?.name ?? preview).toUpperCase()}
          </button>
          {props.warnUnready && preview !== props.current && (
            <span className="text-ink-3 text-sm">
              Switching Faction clears your ready flag.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StartingResources(props: {
  conn: MatchConnection;
  content: ContentLookups;
  current: Map<string, number>;
  disabled: boolean;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(() => new Map(props.current));
  // Show the server's values again whenever they change.
  const currentKey = JSON.stringify([...props.current]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the values, not the Map's identity
  useEffect(() => setDraft(new Map(props.current)), [currentKey]);

  function apply(e: FormEvent) {
    e.preventDefault();
    props.conn.setStartingResources(draft);
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-2">
      <fieldset
        disabled={props.disabled}
        className="flex min-w-0 flex-col gap-2"
      >
        <legend className="mb-2 font-semibold text-ink-2 text-sm">
          Starting resources
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {[...props.content.resources.values()].map((r) => (
            <label key={r.id} className="flex flex-col gap-1.5">
              <span className="text-ink-3 text-sm">{r.name}</span>
              <input
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                required
                value={draft.get(r.id) ?? 0}
                onChange={(e) =>
                  setDraft(new Map(draft).set(r.id, e.target.valueAsNumber))
                }
                className="min-h-11 w-full rounded-md px-3 disabled:opacity-60"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {!props.disabled && (
        <button
          type="submit"
          disabled={props.pending}
          className="min-h-11 self-start rounded-md bg-raised px-4.5 font-medium"
        >
          Apply
        </button>
      )}
    </form>
  );
}
