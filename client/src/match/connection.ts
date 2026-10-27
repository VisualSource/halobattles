import type { MatchData, Session, Socket } from "@heroiclabs/nakama-js";
import { Builder, ByteBuffer } from "flatbuffers";
import {
  AmountT,
  ArmyUnitsT,
  type ArmyViewT,
  BattleEnded,
  BattleRound,
  BattleStarted,
  type BattleViewT,
  CancelQueueItemT,
  type CombatantT,
  CommandRejected,
  type EconomyT,
  LobbyState,
  type LobbyStateT,
  MatchEnded,
  MoveUnitsT,
  Op,
  OrderArmyT,
  PaydayPaid,
  Phase,
  PlanetCaptured,
  type PlanetViewT,
  PlayerEliminated,
  type PlayerViewT,
  QueueBuildingT,
  type QueueItemT,
  QueueUnitT,
  ReorderArmyT,
  SellBuildingT,
  SetFactionT,
  SetMapT,
  SetRallyStackT,
  SetReadyT,
  SetStartingResourcesT,
  StartMatchT,
  SurrenderT,
  ViewDelta,
  type ViewDeltaT,
  ViewFull,
  type ViewFullT,
  type WinHoldT,
} from "../gen/wire";
import { type CommandKind, createLocalStore, updateLastSeen } from "./local";
import {
  type Army,
  applyDelta,
  type Battle,
  type BattleAction,
  type Combatant,
  createMatchStore,
  type ViewDelta as Delta,
  type Economy,
  type Lobby,
  type PlanetView,
  type PlayerView,
  type QueueItem,
  type View,
} from "./store";

export type SocketLike = Pick<
  Socket,
  "connect" | "joinMatch" | "leaveMatch" | "disconnect" | "sendMatchState"
> & {
  onmatchdata: (m: MatchData) => void;
  ondisconnect: (e: Event) => void;
};

const phases = {
  [Phase.Lobby]: "lobby",
  [Phase.Play]: "play",
  [Phase.Results]: "results",
} as const;

// Strings in the object API can be bytes; ours are always decoded text.
const str = (v: string | Uint8Array | null) => (typeof v === "string" ? v : "");

const toAmounts = (as: AmountT[]) =>
  new Map(as.map((a) => [str(a.resource), a.amount]));

function toLobby(t: LobbyStateT): Lobby {
  return {
    phase: phases[t.phase],
    host: str(t.host),
    map: str(t.map),
    startingResources: toAmounts(t.startingResources),
    seats: t.seats.map((s) => ({
      user: str(s.user),
      displayName: str(s.displayName),
      faction: str(s.faction),
      ready: s.ready,
    })),
    winner: t.winner < 0 ? null : t.winner,
    endReason: str(t.endReason),
  };
}

const toWinHold = (h: WinHoldT) => ({
  seat: h.seat < 0 ? null : h.seat,
  ends: Number(h.ends),
});

const STACKS_PER_PLANET = 3;

const toPlayer = (p: PlayerViewT): PlayerView => ({
  seat: p.seat,
  user: str(p.user),
  displayName: str(p.displayName),
  faction: str(p.faction),
  planetCount: p.planetCount,
  eliminated: p.eliminated,
  connected: p.connected,
  graceEnds: Number(p.graceEnds),
});

const toPlanet = (p: PlanetViewT): PlanetView => ({
  id: str(p.id),
  owner: p.owner < 0 ? null : p.owner,
  capital: p.capital,
  locked: p.locked,
  buildings: p.buildings.map(str),
  stacks: Array.from({ length: STACKS_PER_PLANET }, (_, i) =>
    (p.stacks[i]?.slots ?? []).map((u) => ({
      unit: str(u.unit),
      count: u.count,
      cell: u.cell,
    })),
  ),
  queue: p.queue.map(toQueueItem),
  unitQueue: p.unitQueue.map(toQueueItem),
  rallyStack: p.rallyStack,
});

const toArmy = (a: ArmyViewT): Army => ({
  id: a.id,
  owner: a.owner,
  units: a.units.map((u) => ({
    unit: str(u.unit),
    count: u.count,
    cell: u.cell,
  })),
  from: str(a.from),
  to: str(a.to),
  departed: Number(a.departed),
  arrives: Number(a.arrives),
  waiting: a.waiting,
  destination: str(a.destination),
  toStack: a.toStack,
});

const toCombatant = (c: CombatantT): Combatant => ({
  id: str(c.id),
  side: c.side === 0 ? "attacker" : "defender",
  unit: str(c.unit),
  shield: c.shield,
  armor: c.armor,
  hp: c.hp,
});

const toBattle = (b: BattleViewT): Battle => ({
  id: b.id,
  planet: str(b.planet),
  attacker: b.attacker,
  defender: b.defender < 0 ? null : b.defender,
  started: Number(b.started),
  roundMs: b.roundMs,
  round: b.round,
  roster: b.roster.map(toCombatant),
});

const toQueueItem = (q: QueueItemT): QueueItem => ({
  id: q.id,
  slot: q.slot,
  building: str(q.building),
  unit: str(q.unit),
  started: q.started,
  paused: q.paused,
  endsAt: Number(q.endsAt),
  remaining: Number(q.remaining),
});

const toEconomy = (e: EconomyT): Economy => ({
  resources: toAmounts(e.resources),
  commandPointsUsed: e.commandPointsUsed,
  commandPointsCap: e.commandPointsCap,
  paydayStart: Number(e.paydayStart),
  paydayEnd: Number(e.paydayEnd),
});

const NO_ECONOMY: Economy = {
  resources: new Map(),
  commandPointsUsed: 0,
  commandPointsCap: 0,
  paydayStart: 0,
  paydayEnd: 0,
};

function toView(t: ViewFullT): View {
  return {
    matchTime: Number(t.matchTime),
    contentHash: str(t.contentHash),
    ruleset: str(t.ruleset),
    map: str(t.map),
    you: t.you,
    players: t.players.map(toPlayer),
    planets: new Map(t.planets.map((p) => [str(p.id), toPlanet(p)])),
    armies: new Map(t.armies.map((a) => [a.id, toArmy(a)])),
    battles: new Map(t.battles.map((b) => [b.id, toBattle(b)])),
    economy: t.economy ? toEconomy(t.economy) : NO_ECONOMY,
    winHold: t.winHold ? toWinHold(t.winHold) : { seat: null, ends: 0 },
  };
}

const toDelta = (t: ViewDeltaT): Delta => ({
  matchTime: Number(t.matchTime),
  players: t.players.map(toPlayer),
  planets: t.planets.map(toPlanet),
  removedPlanets: t.removedPlanets.map(str),
  armies: t.armies.map(toArmy),
  removedArmies: [...t.removedArmies],
  battles: t.battles.map(toBattle),
  removedBattles: [...t.removedBattles],
  economy: t.economy ? toEconomy(t.economy) : null,
  winHold: t.winHold ? toWinHold(t.winHold) : null,
});

/**
 * Owns the socket for one Match. It decodes every message to plain objects
 * at the edge and writes the Match store, and it sends commands, tracking
 * each by seq in the Local store until the server has processed it. One-off
 * events go out on `events`: "rejected" carries a refused command's reason,
 * "payday" the Map of what each Resource changed by, "captured" a Planet
 * that changed hands, as {planet, from, to} (Seats; null is neutral),
 * "battleStarted" {battle, planet}, "battleRound" {battle, round, actions},
 * "battleEnded" {battle, planet, winner}, "eliminated" {seat}, and
 * "matchEnded" {winner, reason}.
 */
export class MatchConnection {
  readonly store = createMatchStore();
  readonly local = createLocalStore();
  readonly events = new EventTarget();
  /** The signed-in player, whose Seat this connection holds. */
  userId = "";
  private matchId = "";
  private seq = 0;
  private readonly log: boolean;

  constructor(
    private readonly socket: SocketLike,
    opts: { log?: boolean } = {},
  ) {
    this.log = opts.log ?? import.meta.env.DEV;
  }

  async open(session: Session, matchId: string) {
    this.userId = session.user_id ?? "";
    this.socket.onmatchdata = (m) => this.receive(m.op_code, m.data);
    // Not fired by close(), which disconnects without the event.
    this.socket.ondisconnect = () =>
      this.store.setState({ disconnected: true });
    await this.socket.connect(session, true);
    await this.socket.joinMatch(matchId);
    this.matchId = matchId;
  }

  /** Waits for the server to drop the Seat before disconnecting. */
  async close() {
    if (this.matchId)
      await this.socket.leaveMatch(this.matchId).catch(() => {});
    this.socket.disconnect(false);
  }

  setFaction(faction: string) {
    this.send(Op.SetFaction, "faction", (seq) => new SetFactionT(seq, faction));
  }

  setReady(ready: boolean) {
    this.send(Op.SetReady, "ready", (seq) => new SetReadyT(seq, ready));
  }

  setMap(map: string) {
    this.send(Op.SetMap, "map", (seq) => new SetMapT(seq, map));
  }

  setStartingResources(amounts: Map<string, number>) {
    const sorted = [...amounts].sort(([a], [b]) => (a < b ? -1 : 1));
    this.send(
      Op.SetStartingResources,
      "startingResources",
      (seq) =>
        new SetStartingResourcesT(
          seq,
          sorted.map(([r, a]) => new AmountT(r, a)),
        ),
    );
  }

  startMatch() {
    this.send(Op.StartMatch, "start", (seq) => new StartMatchT(seq));
  }

  queueBuilding(planet: string, slot: number, building: string) {
    this.send(
      Op.QueueBuilding,
      "build",
      (seq) => new QueueBuildingT(seq, planet, slot, building),
    );
  }

  cancelQueueItem(itemId: number) {
    this.send(
      Op.CancelQueueItem,
      "cancel",
      (seq) => new CancelQueueItemT(seq, itemId),
    );
  }

  queueUnit(planet: string, slot: number, unit: string, count: number) {
    this.send(
      Op.QueueUnit,
      "train",
      (seq) => new QueueUnitT(seq, planet, slot, unit, count),
    );
  }

  /**
   * Moves count units out of the Unit Slot in fromCell into toCell of a
   * Stack. A toCell of -1 tops up that Stack's slots of the unit, then
   * fills free cells.
   */
  moveUnits(
    planet: string,
    from: { stack: number; cell: number },
    to: { stack: number; cell: number },
    unit: string,
    count: number,
  ) {
    this.send(
      Op.MoveUnits,
      "move",
      (seq) =>
        new MoveUnitsT(
          seq,
          planet,
          from.stack,
          to.stack,
          unit,
          count,
          to.cell,
          from.cell,
        ),
    );
  }

  orderArmy(
    from: string,
    units: { stack: number; unit: string; count: number }[],
    to: string,
    toStack: number,
  ) {
    const list = units.map((u) => new ArmyUnitsT(u.stack, u.unit, u.count));
    this.send(
      Op.OrderArmy,
      "order",
      (seq) => new OrderArmyT(seq, from, list, to, toStack),
    );
  }

  reorderArmy(army: number, to: string, toStack: number) {
    this.send(
      Op.ReorderArmy,
      "order",
      (seq) => new ReorderArmyT(seq, army, to, toStack),
    );
  }

  /** A Forfeit: it eliminates you. */
  surrender() {
    this.send(Op.Surrender, "surrender", (seq) => new SurrenderT(seq));
  }

  setRallyStack(planet: string, stack: number) {
    this.send(
      Op.SetRallyStack,
      "rally",
      (seq) => new SetRallyStackT(seq, planet, stack),
    );
  }

  sellBuilding(planet: string, slot: number) {
    this.send(
      Op.SellBuilding,
      "sell",
      (seq) => new SellBuildingT(seq, planet, slot),
    );
  }

  private send(
    op: Op,
    kind: CommandKind,
    make: (seq: number) => { pack(b: Builder): number },
  ) {
    const seq = ++this.seq;
    const b = new Builder(64);
    b.finish(make(seq).pack(b));
    this.local.setState((s) => ({
      pending: new Map(s.pending).set(seq, kind),
    }));
    // slice(): the builder's array is a view into a larger buffer.
    this.socket
      .sendMatchState(this.matchId, op, b.asUint8Array().slice())
      .catch((e) => this.reject(seq, `couldn't send: ${e}`));
  }

  private receive(op: number, data: Uint8Array) {
    const bb = new ByteBuffer(data);
    switch (op) {
      case Op.LobbyState: {
        const t = LobbyState.getRootAsLobbyState(bb).unpack();
        const lobby = toLobby(t);
        this.debug("LobbyState", lobby);
        this.store.setState({ lobby });
        const mine = t.seats.find((s) => str(s.user) === this.userId);
        if (mine) this.settle(mine.lastSeq);
        return;
      }
      case Op.ViewFull: {
        const view = toView(ViewFull.getRootAsViewFull(bb).unpack());
        this.debug("ViewFull", view);
        this.syncClock(view.matchTime);
        this.store.setState({ view });
        this.local.setState((s) => ({
          lastSeen: updateLastSeen(
            s.lastSeen,
            undefined,
            [],
            view.planets.keys(),
            view.matchTime,
          ),
        }));
        return;
      }
      case Op.ViewDelta: {
        const delta = toDelta(ViewDelta.getRootAsViewDelta(bb).unpack());
        this.debug("ViewDelta", delta);
        this.syncClock(delta.matchTime);
        const { view } = this.store.getState();
        if (!view) return;
        this.store.setState({ view: applyDelta(view, delta) });
        this.local.setState((s) => ({
          lastSeen: updateLastSeen(
            s.lastSeen,
            view.planets,
            delta.removedPlanets,
            delta.planets.map((p) => p.id),
            delta.matchTime,
          ),
        }));
        return;
      }
      case Op.PaydayPaid: {
        const t = PaydayPaid.getRootAsPaydayPaid(bb).unpack();
        this.debug("PaydayPaid", t);
        this.syncClock(Number(t.matchTime));
        this.events.dispatchEvent(
          new CustomEvent("payday", { detail: toAmounts(t.net) }),
        );
        return;
      }
      case Op.PlanetCaptured: {
        const t = PlanetCaptured.getRootAsPlanetCaptured(bb).unpack();
        this.debug("PlanetCaptured", t);
        this.syncClock(Number(t.matchTime));
        this.events.dispatchEvent(
          new CustomEvent("captured", {
            detail: {
              planet: str(t.planet),
              from: t.from < 0 ? null : t.from,
              to: t.to,
            },
          }),
        );
        return;
      }
      case Op.BattleStarted: {
        const t = BattleStarted.getRootAsBattleStarted(bb).unpack();
        this.debug("BattleStarted", t);
        this.syncClock(Number(t.matchTime));
        this.emit("battleStarted", { battle: t.battle, planet: str(t.planet) });
        return;
      }
      case Op.BattleRound: {
        const t = BattleRound.getRootAsBattleRound(bb).unpack();
        this.debug("BattleRound", t);
        this.syncClock(Number(t.matchTime));
        const actions: BattleAction[] = t.actions.map((a) => ({
          actor: str(a.actor),
          target: str(a.target),
          weapon: str(a.weapon),
          shieldDmg: a.shieldDmg,
          armorDmg: a.armorDmg,
          hpDmg: a.hpDmg,
          killed: a.killed,
        }));
        this.emit("battleRound", { battle: t.battle, round: t.round, actions });
        return;
      }
      case Op.BattleEnded: {
        const t = BattleEnded.getRootAsBattleEnded(bb).unpack();
        this.debug("BattleEnded", t);
        this.syncClock(Number(t.matchTime));
        this.emit("battleEnded", {
          battle: t.battle,
          planet: str(t.planet),
          winner: t.winner < 0 ? null : t.winner,
        });
        return;
      }
      case Op.PlayerEliminated: {
        const t = PlayerEliminated.getRootAsPlayerEliminated(bb).unpack();
        this.debug("PlayerEliminated", t);
        this.syncClock(Number(t.matchTime));
        this.emit("eliminated", { seat: t.seat });
        return;
      }
      case Op.MatchEnded: {
        const t = MatchEnded.getRootAsMatchEnded(bb).unpack();
        this.debug("MatchEnded", t);
        this.emit("matchEnded", {
          winner: t.winner < 0 ? null : t.winner,
          reason: str(t.reason),
        });
        return;
      }
      case Op.CommandRejected: {
        const t = CommandRejected.getRootAsCommandRejected(bb).unpack();
        this.debug("CommandRejected", t);
        if (this.store.getState().view) this.syncClock(Number(t.matchTime));
        this.reject(t.seq, str(t.reason));
        return;
      }
      default:
        console.warn(`[match] unknown opcode ${op}`);
    }
  }

  private emit(type: string, detail: unknown) {
    this.events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Every play message carries the Match Time it was sent at. */
  private syncClock(matchTime: number) {
    this.local.setState({ clockOffset: matchTime - performance.now() });
  }

  /** Drops every pending command the server has processed. */
  private settle(lastSeq: number) {
    this.local.setState((s) => ({
      pending: new Map([...s.pending].filter(([seq]) => seq > lastSeq)),
    }));
  }

  private reject(seq: number, reason: string) {
    this.local.setState((s) => {
      const pending = new Map(s.pending);
      pending.delete(seq);
      return { pending };
    });
    this.events.dispatchEvent(new CustomEvent("rejected", { detail: reason }));
  }

  private debug(name: string, value: unknown) {
    if (!this.log) return;
    // FlatBuffers hands 64-bit fields (Match Times) over as bigint.
    const json = JSON.stringify(value, (_k, v) =>
      v instanceof Map
        ? Object.fromEntries(v)
        : typeof v === "bigint"
          ? Number(v)
          : v,
    );
    console.debug(`[match] ${name}`, json);
  }
}
