import type { MatchData, Session, Socket } from "@heroiclabs/nakama-js";
import { Builder, ByteBuffer } from "flatbuffers";
import {
  AddBotT,
  AmountT,
  ArmyUnitsT,
  type ArmyViewT,
  BattleBuildTurretT,
  BattleCancelRetreatT,
  BattleEnded,
  type BattlefieldT,
  BattleRetreatT,
  BattleStarted,
  BattleTick,
  type BattleViewT,
  CancelProjectT,
  CancelQueueItemT,
  CommandRejected,
  type EconomyT,
  ExchangeT,
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
  RemoveBotT,
  ReorderArmyT,
  type ResearchT,
  SellBuildingT,
  SetFactionT,
  SetMapT,
  SetRallyStackT,
  SetReadyT,
  SetStartingResourcesT,
  StartMatchT,
  StartProjectT,
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
  type Battlefield,
  type BattleReport,
  createMatchStore,
  type ViewDelta as Delta,
  type Economy,
  type Lobby,
  type PlanetView,
  type PlayerView,
  type QueueItem,
  type Research,
  reportView,
  reportVolleys,
  type Side,
  type View,
  type Volley,
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
      bot: str(s.bot),
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
  bot: str(p.bot),
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
  richness: new Map(p.richness.map((r) => [str(r.resource), str(r.level)])),
  labs: new Map(p.labs.map((l) => [l.slot, l.techs.map(str)])),
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
  path: a.path.map(str),
});

const side = (n: number): Side => (n === 0 ? "attacker" : "defender");

const toField = (f: BattlefieldT): Battlefield => ({
  width: f.width,
  height: f.height,
  terrains: f.terrains.map(str),
  terrain: [...f.terrain],
  heights: [...f.heights],
});

/** field is for a delta, which leaves the Battlefield out. */
const toBattle = (
  b: BattleViewT,
  field: Battlefield | null = null,
): Battle => ({
  id: b.id,
  planet: str(b.planet),
  attacker: b.attacker,
  defender: b.defender < 0 ? null : b.defender,
  started: Number(b.started),
  tick: b.tick,
  edge: b.edge,
  field: b.field ? toField(b.field) : field,
  squads: b.squads.map((q) => ({
    id: q.id,
    side: side(q.side),
    unit: str(q.unit),
    building: q.building,
    x: q.x,
    y: q.y,
    count: q.count,
    start: q.start,
    shield: q.shield,
    armor: q.armor,
    hp: q.hp,
  })),
  points: b.points.map((p) => ({
    x: p.x,
    y: p.y,
    owner: side(p.owner),
    taker: side(p.taker),
    progress: p.progress,
  })),
  pads: b.pads.map((p) => ({
    x: p.x,
    y: p.y,
    owner: p.owner < 0 ? null : side(p.owner),
    taker: p.taker < 0 ? null : side(p.taker),
    progress: p.progress,
    turret: p.turret,
    building: str(p.building),
    readyAt: p.readyAt,
  })),
  hold: b.hold,
  holdPaused: b.holdPaused,
  retreatAt: b.retreatAt,
  retreating: {
    attacker: b.attackerRetreating,
    defender: b.defenderRetreating,
  },
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
  caps: toAmounts(e.caps),
  projected: toAmounts(e.projected),
});

const NO_ECONOMY: Economy = {
  resources: new Map(),
  commandPointsUsed: 0,
  commandPointsCap: 0,
  paydayStart: 0,
  paydayEnd: 0,
  caps: new Map(),
  projected: new Map(),
};

const toResearch = (r: ResearchT): Research => ({
  rate: r.rate,
  projectLimit: r.projectLimit,
  projects: r.projects.map((p) => ({
    tech: str(p.tech),
    planet: str(p.planet),
    slot: p.slot,
    cost: p.cost,
    done: p.done,
    since: Number(p.since),
    rate: p.rate,
  })),
  hand: r.hand.map(str),
  saved: r.saved.map((v) => ({
    tech: str(v.tech),
    cost: v.cost,
    done: v.done,
    lost: v.lost,
  })),
});

const NO_RESEARCH: Research = {
  rate: 0,
  projectLimit: 0,
  projects: [],
  hand: [],
  saved: [],
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
    research: t.research ? toResearch(t.research) : NO_RESEARCH,
    winHold: t.winHold ? toWinHold(t.winHold) : { seat: null, ends: 0 },
  };
}

const toDelta = (t: ViewDeltaT, fields: Map<number, Battlefield>): Delta => ({
  matchTime: Number(t.matchTime),
  players: t.players.map(toPlayer),
  planets: t.planets.map(toPlanet),
  removedPlanets: t.removedPlanets.map(str),
  armies: t.armies.map(toArmy),
  removedArmies: [...t.removedArmies],
  battles: t.battles.map((b) => toBattle(b, fields.get(b.id) ?? null)),
  removedBattles: [...t.removedBattles],
  economy: t.economy ? toEconomy(t.economy) : null,
  research: t.research ? toResearch(t.research) : null,
  winHold: t.winHold ? toWinHold(t.winHold) : null,
});

/**
 * Owns the socket for one Match. It decodes every message to plain objects
 * at the edge and writes the Match store, and it sends commands, tracking
 * each by seq in the Local store until the server has processed it. One-off
 * events go out on `events`: "rejected" carries a refused command's reason,
 * "payday" the Map of what each Resource changed by, "captured" a Planet
 * that changed hands, as {planet, from, to} (Seats; null is neutral),
 * "battleStarted" {battle, planet}, "battleTick" {battle, tick, volleys},
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
  /** Each running Battle's Battlefield, which only ViewFull and BattleStarted carry. */
  private readonly fields = new Map<number, Battlefield>();

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
    // Leaving on purpose isn't a lost connection: the socket's own close
    // handler calls ondisconnect even with disconnect(false).
    this.socket.ondisconnect = () => {};
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

  /** Host only: a Bot of faction at difficulty takes an empty Seat. */
  addBot(faction: string, difficulty: string) {
    this.send(Op.AddBot, "bot", (seq) => new AddBotT(seq, faction, difficulty));
  }

  /** Host only: frees the Bot's Seat; user is its Seat's user id. */
  removeBot(user: string) {
    this.send(Op.RemoveBot, "bot", (seq) => new RemoveBotT(seq, user));
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

  /** Builds a pad turret on a build pad your side holds in the Battle on planet. */
  buildTurret(planet: string, pad: number, building: string) {
    this.send(
      Op.BattleBuildTurret,
      "padTurret",
      (seq) => new BattleBuildTurretT(seq, planet, pad, building),
    );
  }

  /** Starts your side's Retreat countdown in the Battle on planet, or calls it off. */
  retreat(planet: string, cancel = false) {
    this.send(
      cancel ? Op.BattleCancelRetreat : Op.BattleRetreat,
      "retreat",
      (seq) =>
        cancel
          ? new BattleCancelRetreatT(seq, planet)
          : new BattleRetreatT(seq, planet),
    );
  }

  setRallyStack(planet: string, stack: number) {
    this.send(
      Op.SetRallyStack,
      "rally",
      (seq) => new SetRallyStackT(seq, planet, stack),
    );
  }

  /** Researches tech, from the hand or saved, in the Lab in slot of planet. */
  startProject(tech: string, planet: string, slot: number) {
    this.send(
      Op.StartProject,
      "research",
      (seq) => new StartProjectT(seq, tech, planet, slot),
    );
  }

  /** Stops tech's Project, keeping its progress. */
  cancelProject(tech: string) {
    this.send(
      Op.CancelProject,
      "research",
      (seq) => new CancelProjectT(seq, tech),
    );
  }

  /** Trades amount of give, a whole multiple of its rate, for get. */
  exchange(give: string, get: string, amount: number) {
    this.send(
      Op.Exchange,
      "exchange",
      (seq) => new ExchangeT(seq, give, get, amount),
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
        for (const b of view.battles.values())
          if (b.field) this.fields.set(b.id, b.field);
        this.store.setState({ view });
        this.seedReports(view.battles.values());
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
        const delta = toDelta(
          ViewDelta.getRootAsViewDelta(bb).unpack(),
          this.fields,
        );
        this.debug("ViewDelta", delta);
        this.syncClock(delta.matchTime);
        const { view } = this.store.getState();
        if (!view) return;
        this.store.setState({ view: applyDelta(view, delta) });
        this.seedReports(delta.battles);
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
        if (t.field) this.fields.set(t.battle, toField(t.field));
        this.setReport(t.battle, () => ({
          id: t.battle,
          planet: str(t.planet),
          attacker: t.attacker,
          defender: t.defender < 0 ? null : t.defender,
          squads: new Map(),
          ticks: 0,
          damage: { attacker: 0, defender: 0 },
        }));
        this.emit("battleStarted", { battle: t.battle, planet: str(t.planet) });
        return;
      }
      case Op.BattleTick: {
        const t = BattleTick.getRootAsBattleTick(bb).unpack();
        this.debug("BattleTick", t);
        this.syncClock(Number(t.matchTime));
        const volleys: Volley[] = t.volleys.map((v) => ({
          actor: v.actor,
          target: v.target,
          shots: v.shots,
          hits: v.hits,
          kills: v.kills,
          shieldDmg: v.shieldDmg,
          armorDmg: v.armorDmg,
          hpDmg: v.hpDmg,
        }));
        this.setReport(t.battle, (r) => r && reportVolleys(r, t.tick, volleys));
        this.emit("battleTick", { battle: t.battle, tick: t.tick, volleys });
        return;
      }
      case Op.BattleEnded: {
        const t = BattleEnded.getRootAsBattleEnded(bb).unpack();
        this.debug("BattleEnded", t);
        this.syncClock(Number(t.matchTime));
        const winner = t.winner < 0 ? null : t.winner;
        this.fields.delete(t.battle);
        this.setReport(
          t.battle,
          (r) => r && { ...r, winner, endedAt: Number(t.matchTime) },
        );
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

  /** Updates one Battle's report; returning undefined leaves it out. */
  private setReport(
    id: number,
    f: (r: BattleReport | undefined) => BattleReport | undefined,
  ) {
    this.local.setState((s) => {
      const next = f(s.reports.get(id));
      return next ? { reports: new Map(s.reports).set(id, next) } : {};
    });
  }

  /** Each Battle in a View brings its report up to date, or starts one. */
  private seedReports(battles: Iterable<Battle>) {
    for (const b of battles) this.setReport(b.id, (r) => reportView(r, b));
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
