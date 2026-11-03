import { Switch } from "@base-ui/react/switch";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { type FormEvent, type ReactNode, useState } from "react";
import { useStore } from "zustand";
import { useRingBackdrop } from "../backdrop";
import type { ContentLookups } from "../content";
import type { Faction, GalaxyMap } from "../gen/content";
import { seatColour } from "../scene/galaxy";
import { Dialog } from "../ui/dialog";
import { BotTag } from "./bot-tag";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { inviteUrl } from "./phase";
import { Joining } from "./status";
import type { Lobby } from "./store";

const byId = <T,>(m: Map<string, T>) =>
  [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

/** The Factions on offer to players and Bots: a hidden one only supplies content. */
const pickable = (content: ContentLookups) =>
  byId(content.factions).filter(([, f]) => !f.hidden);

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
  useRingBackdrop();
  if (!lobby) return <Joining matchId={props.matchId} />;

  const map = content.maps.get(lobby.map);
  const me = lobby.seats.find((s) => s.user === userId);
  const isHost = lobby.host === userId;
  const canStart =
    isHost &&
    lobby.seats.every((s) => s.ready || s.user === lobby.host) &&
    lobby.seats.length >= (map?.minPlayers ?? Number.POSITIVE_INFINITY);

  return (
    <>
      {/* Sits above the ring (later in the DOM, same z) so the lobby stays readable. */}
      <div
        aria-hidden="true"
        className="bg-ground/70 fixed inset-0 -z-10 backdrop-blur-md"
      />
      {/* h-0 flex-1: exactly the screen below the header, so the columns scroll, not the page. */}
      <div className="mx-auto flex h-0 min-h-0 w-full max-w-300 flex-1 flex-col gap-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-ink-3 text-xs font-semibold tracking-[0.14em]">
              PRE-MATCH LOBBY
            </p>
            <h2 className="font-display text-4xl font-semibold">
              {lobby.seats.length} of {map?.starts.length ?? "?"} Seats filled
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Invite matchId={props.matchId} />
            <Link
              to="/"
              className="border-edge text-ink-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium hover:no-underline"
            >
              Leave lobby
            </Link>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-h-0 min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Seats
              lobby={lobby}
              content={content}
              map={map}
              userId={userId}
              conn={isHost ? conn : undefined}
              pending={isPending(local, "bot")}
              onTeam={
                isPending(local, "team")
                  ? undefined
                  : (user, team) => conn.setTeam(user, team)
              }
            />
            <Spectators
              lobby={lobby}
              userId={userId}
              seated={!!me}
              seatFree={lobby.seats.length < (map?.starts.length ?? 0)}
              pending={isPending(local, "seat")}
              conn={conn}
            />
          </div>

          {/* Stretched to the row; the panel inside keeps its own height and scrolls past it. */}
          <div className="flex min-h-0 min-w-0 flex-[1_1_320px] flex-col gap-6">
            <section className="border-line bg-panel flex min-h-0 flex-col overflow-hidden rounded-[10px] border">
              {/* Header and body, like Seats: the header stays while the body scrolls. */}
              <div className="border-line flex flex-none items-center justify-between gap-2 border-b px-5 py-4">
                <h2 className={sectionTitle}>MATCH SETTINGS</h2>
                {!isHost && (
                  <span className="text-ink-3 text-xs">Host only</span>
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
                <div className="flex flex-col gap-2">
                  <span className="text-ink-2 text-sm font-semibold">Map</span>
                  {map && (
                    <MapRow
                      map={map}
                      disabled={!isHost || isPending(local, "map")}
                      trailing={
                        isHost && (
                          <span className="text-ink-3 text-sm">Change</span>
                        )
                      }
                      onClick={() => setDialog("map")}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    id="lobby-teams"
                    className="text-ink-2 text-sm font-semibold"
                  >
                    Teams
                  </span>
                  <Switch.Root
                    aria-labelledby="lobby-teams"
                    checked={lobby.teams}
                    disabled={!isHost || isPending(local, "teams")}
                    onCheckedChange={(on) => conn.setTeams(on)}
                    className="bg-line data-checked:bg-accent flex h-6 w-10 flex-none items-center rounded-full border-0 p-0.5 transition-colors data-disabled:cursor-default data-disabled:opacity-50"
                  >
                    <Switch.Thumb className="bg-ink size-5 rounded-full transition-transform data-checked:translate-x-4" />
                  </Switch.Root>
                </div>
                <StartingResources
                  conn={conn}
                  content={content}
                  current={lobby.startingResources}
                  disabled={!isHost}
                  pending={isPending(local, "startingResources")}
                />
              </div>
            </section>
            {me && (
              <section className="border-line bg-panel flex flex-none flex-col gap-4 rounded-[10px] border p-5">
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
        </div>
      </div>

      <footer className="border-line bg-bar sticky bottom-0 border-t">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-8 py-4">
          <p className="text-ink-2">{status(lobby, map, userId)}</p>
          {isHost ? (
            <button
              type="button"
              disabled={!canStart || isPending(local, "start")}
              onClick={() => conn.startMatch()}
              className="bg-accent font-display text-accent-ink disabled:bg-line disabled:text-ink-4 min-h-13 min-w-50 rounded-lg border-0 px-7 text-lg font-bold tracking-[0.12em] disabled:opacity-100"
            >
              START MATCH
            </button>
          ) : (
            <label
              className={cn(
                "font-display inline-flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border px-6 text-lg font-bold tracking-[0.12em]",
                me?.ready
                  ? "border-ok-edge bg-ok-wash text-ok"
                  : "border-edge bg-raised",
                !me && "text-ink-4 cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={me?.ready ?? false}
                disabled={!me || isPending(local, "ready")}
                onChange={(e) => conn.setReady(e.target.checked)}
                className="accent-accent size-5.5"
              />
              READY
            </label>
          )}
        </div>
      </footer>

      <Dialog
        open={dialog === "map"}
        onClose={() => setDialog(null)}
        label="maps-title"
        className="border-edge bg-panel text-ink m-auto max-h-[80vh] w-full max-w-lg rounded-xl border"
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
          className="bg-void text-ink m-0 h-screen max-h-none w-screen max-w-none"
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
    if (!me) return "You're spectating. You'll watch once the Host starts.";
    return me.ready
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
  const url = inviteUrl(location.origin, props.matchId);
  // The clipboard needs a secure context.
  const copy = () =>
    navigator.clipboard
      ?.writeText(url)
      .then(() => setCopied(true))
      .catch(() => {});
  return (
    <div className="border-line bg-panel flex min-w-0 items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-4">
      <span className="text-ink-3 text-sm">Invite</span>
      <code title={url} className="max-w-80 truncate font-mono text-sm">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="bg-raised min-h-11 rounded-md border-0 px-3 text-sm font-medium"
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
  conn?: MatchConnection; // the Host's: adds and removes Bots
  pending: boolean;
  onTeam?: (user: string, team: number) => void; // undefined while one is pending
}) {
  const { lobby, content, conn } = props;
  const open = Math.max(
    0,
    (props.map?.starts.length ?? 0) - lobby.seats.length,
  );
  return (
    <section className="border-line bg-panel flex min-h-0 flex-col overflow-hidden rounded-[10px] border">
      <h2 className={cn(sectionTitle, "border-line border-b px-5 py-4")}>
        SEATS
      </h2>
      {/* The list scrolls, so a big map's Seats never push the page. */}
      <ol className="min-h-0 overflow-y-auto">
        {lobby.seats.map((s, i) => {
          const host = s.user === lobby.host;
          const me = s.user === props.userId;
          return (
            <li
              key={s.user}
              className={cn(
                "border-divider flex min-h-18 items-center gap-4 border-b px-5",
                me && "bg-highlight",
              )}
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
                  {s.bot && <BotTag content={content} difficulty={s.bot} />}
                  {host && (
                    <span className="bg-host-wash text-host rounded px-2 py-0.5 text-[11px] font-semibold tracking-widest">
                      HOST
                    </span>
                  )}
                </div>
                <span className="text-ink-3 text-sm">
                  {content.factions.get(s.faction)?.name ?? s.faction}
                </span>
              </div>
              {lobby.teams && (
                // Yours to change, and the Host's for Bots; everyone else's only shows.
                <select
                  aria-label={`${s.displayName}'s Team`}
                  value={s.team}
                  disabled={!props.onTeam || !(me || (s.bot && conn))}
                  onChange={(e) =>
                    props.onTeam?.(s.user, Number(e.target.value))
                  }
                  className="min-h-11 w-28 disabled:opacity-100"
                >
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={t}>
                      Team {t}
                    </option>
                  ))}
                </select>
              )}
              {!host && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${s.ready ? "bg-ok-wash text-ok" : "bg-idle-wash text-idle"}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-current"
                  />
                  {s.ready ? "Ready" : "Not ready"}
                </span>
              )}
              {conn && s.bot && (
                <button
                  type="button"
                  disabled={props.pending}
                  onClick={() => conn.removeBot(s.user)}
                  className="border-edge text-ink-2 min-h-11 rounded-md border bg-transparent px-4 font-medium"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
        {Array.from({ length: open }, (_, i) => `open-${i}`).map((key) => (
          <li
            key={key}
            className="border-divider flex min-h-18 items-center gap-4 border-b px-5"
          >
            <span
              aria-hidden="true"
              className="bg-open-seat h-10 w-1.5 rounded-sm"
            />
            {conn ? (
              <AddBot
                content={content}
                pending={props.pending}
                onAdd={(faction, difficulty) =>
                  conn.addBot(faction, difficulty)
                }
              />
            ) : (
              <span className="text-ink-4 italic">
                Open Seat · waiting for a player
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Who's watching, with your own switch: Spectate from a Seat, or Take a
 * Seat while one is free. The list scrolls in a fixed height.
 */
function Spectators(props: {
  lobby: Lobby;
  userId: string;
  seated: boolean;
  seatFree: boolean;
  pending: boolean;
  conn: MatchConnection;
}) {
  const { lobby, conn } = props;
  return (
    <section className="border-line bg-panel flex-none overflow-hidden rounded-[10px] border">
      <div className="border-line flex items-center gap-3 border-b px-5 py-3">
        <h2 className={cn(sectionTitle, "flex-1")}>
          SPECTATORS{" "}
          <span className="text-ink-3 font-mono text-sm">
            {lobby.spectators.length}/{MAX_SPECTATORS}
          </span>
        </h2>
        {props.seated ? (
          <button
            type="button"
            disabled={
              props.pending || lobby.spectators.length >= MAX_SPECTATORS
            }
            onClick={() => conn.spectate()}
            className="border-edge text-ink-2 min-h-11 rounded-md border bg-transparent px-4 font-medium"
          >
            Spectate
          </button>
        ) : (
          <button
            type="button"
            disabled={props.pending || !props.seatFree}
            title={props.seatFree ? undefined : "Every Seat is taken"}
            onClick={() => conn.takeSeat()}
            className="bg-raised min-h-11 rounded-md px-4 font-medium"
          >
            Take a Seat
          </button>
        )}
      </div>
      <ul className="h-30 overflow-y-auto">
        {lobby.spectators.length === 0 && (
          <li className="text-ink-4 px-5 py-3 italic">Nobody is watching.</li>
        )}
        {lobby.spectators.map((s) => {
          const me = s.user === props.userId;
          return (
            <li
              key={s.user}
              className={cn(
                "border-divider flex min-h-10 items-center gap-2 border-b px-5",
                me && "bg-highlight",
              )}
            >
              <span className="font-semibold">
                {s.displayName || "(no name)"}
              </span>
              {me && <span className="text-ink-3 text-xs">(you)</span>}
              {s.user === lobby.host && (
                <span className="bg-host-wash text-host rounded px-2 py-0.5 text-[11px] font-semibold tracking-widest">
                  HOST
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** game.MaxSpectators on the server. */
const MAX_SPECTATORS = 6;

/** The Host's open Seat: a player can still join it, or a Bot can take it. */
function AddBot(props: {
  content: ContentLookups;
  pending: boolean;
  onAdd: (faction: string, difficulty: string) => void;
}) {
  const factions = pickable(props.content);
  const difficulties = props.content.rules.botDifficulties;
  const [faction, setFaction] = useState(factions[0]?.[0] ?? "");
  const [difficulty, setDifficulty] = useState(difficulties[0].id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onAdd(faction, difficulty);
      }}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    >
      <span className="text-ink-4 flex-1 italic">Open Seat</span>
      <select
        aria-label="Bot Faction"
        value={faction}
        onChange={(e) => setFaction(e.target.value)}
        className="min-h-11"
      >
        {factions.map(([id, f]) => (
          <option key={id} value={id}>
            {f.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Bot difficulty"
        value={difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
        className="min-h-11"
      >
        {difficulties.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={props.pending}
        className="bg-raised min-h-11 rounded-md px-4 font-medium"
      >
        Add Bot
      </button>
    </form>
  );
}

function CloseButton(props: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="border-edge text-ink-2 inline-flex min-h-11 items-center gap-2 rounded-md bg-transparent px-4 font-medium"
    >
      {props.children ?? "Close"}
    </button>
  );
}

/** The map's Planets and Lanes in miniature, with its starts in the accent. */
export function MapGlyph(props: { map: GalaxyMap }) {
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
      className={`flex w-full items-center gap-3.5 rounded-lg border px-3 py-2.5 text-left disabled:cursor-default ${props.selected ? "border-accent bg-accent-wash border-2" : "border-edge bg-well"}`}
    >
      <span className="bg-tile flex size-14 flex-none items-center justify-center rounded-md">
        <MapGlyph map={map} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[17px] font-semibold">
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
      <div className="border-line flex items-center justify-between gap-2 border-b py-3 pr-3 pl-5">
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
      className={cn(
        "bg-raised font-display flex flex-none items-center justify-center rounded-md font-bold",
        props.className,
      )}
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
      className="border-edge bg-well flex min-h-22 w-full items-center gap-4 rounded-lg px-4 py-3 text-left"
    >
      <Emblem faction={props.faction} className="size-16 text-3xl" />
      <span className="font-display flex-1 text-xl font-semibold">
        {props.faction?.name ?? "?"}
      </span>
      <span className="text-accent text-sm font-semibold">Change</span>
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
      <div className="border-line bg-ground flex items-center justify-between gap-4 border-b px-8 py-3">
        <h2
          id="factions-title"
          className="font-display text-xl font-bold tracking-[0.14em]"
        >
          CHOOSE YOUR FACTION
        </h2>
        <CloseButton onClick={props.onClose}>Back to lobby</CloseButton>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="bg-hero relative flex min-w-0 flex-1 items-end overflow-hidden p-10">
          <span
            aria-hidden="true"
            className="font-display absolute top-1/2 right-[8%] -translate-y-1/2 text-[420px] leading-none font-bold text-white/5"
          >
            {faction?.name.slice(0, 1)}
          </span>
          <p className="font-display text-ink-bright relative text-7xl leading-none font-bold">
            {faction?.name ?? preview}
          </p>
        </div>
        <aside className="border-line bg-bar flex w-90 flex-none flex-col gap-7 overflow-y-auto border-l p-8">
          <div className="flex flex-col gap-3">
            <h3 className="text-ink-3 text-xs font-semibold tracking-[0.14em]">
              STARTING ARMY
            </h3>
            <ul className="flex flex-col gap-2">
              {[...units].map(([id, count]) => (
                <li
                  key={id}
                  className={cn(listItem, "flex justify-between gap-3")}
                >
                  <span>{content.units.get(id)?.name ?? id}</span>
                  <span className="text-ink-2 font-mono">×{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-ink-3 text-xs font-semibold tracking-[0.14em]">
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

      <div className="border-line bg-ground flex flex-wrap items-center justify-between gap-5 border-t px-8 py-5">
        <div className="flex flex-wrap gap-3">
          {pickable(content).map(([id, f]) => (
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
                <span className="bg-line text-ink-2 absolute top-2 right-2 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-widest">
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
            className="bg-accent font-display text-accent-ink min-h-14 min-w-60 rounded-lg border-0 px-8 text-lg font-bold tracking-[0.12em]"
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
  // Tagged with the server's values, so it shows them again whenever they change.
  const currentKey = JSON.stringify([...props.current]);
  const [edit, setEdit] = useState(() => ({
    key: currentKey,
    draft: new Map(props.current),
  }));
  const draft = edit.key === currentKey ? edit.draft : props.current;
  const setDraft = (d: Map<string, number>) =>
    setEdit({ key: currentKey, draft: d });

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
        <legend className="text-ink-2 mb-2 text-sm font-semibold">
          Starting resources
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {[...props.content.resources.values()].map((r) => (
            <label key={r.id} className="flex flex-col gap-1.5">
              <span className="text-ink-3 text-sm">{r.name}</span>
              <input
                type="number"
                min={0}
                max={props.content.rules.stockpileCaps[r.id]}
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
          className="bg-raised min-h-11 self-start rounded-md px-4.5 font-medium"
        >
          Apply
        </button>
      )}
    </form>
  );
}
