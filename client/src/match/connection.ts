import type { MatchData, Session, Socket } from "@heroiclabs/nakama-js";
import { Builder, ByteBuffer } from "flatbuffers";
import {
  AddBotT,
  AmountT,
  AnswerTruceT,
  ArmyUnitsT,
  type ArmyViewT,
  BattleBuildTurretT,
  BattleCancelRetreatT,
  BattleEnded,
  type BattlefieldT,
  BattleLandT,
  BattleOrderKind,
  BattleOrderT,
  BattleRetreatT,
  BattleStarted,
  BattleTick,
  type BattleViewT,
  CancelProjectT,
  CancelQueueItemT,
  type CellT,
  CommandRejected,
  DefenceLayout as DefenceLayoutMsg,
  type DefenceLayoutT,
  DropState,
  type EconomyT,
  EndTruceT,
  ExchangeT,
  LayoutStartT,
  LobbyState,
  type LobbyStateT,
  MatchEnded,
  MoveUnitsT,
  OfferTruceT,
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
  RaidTurnedBack,
  RemoveBotT,
  ReorderArmyT,
  ReorderCourierT,
  RequestDefenceLayoutT,
  type ResearchT,
  SellBuildingT,
  SendTechT,
  SetBattleCommandT,
  SetBattleControlT,
  SetDefenceLayoutT,
  SetFactionT,
  SetMapT,
  SetRallyPointT,
  SetRallyStackT,
  SetReadyT,
  SetStartingResourcesT,
  SetTeamsT,
  SetTeamT,
  SpectateT,
  StartMatchT,
  StartProjectT,
  SurrenderT,
  TakeSeatT,
  TruceChanged,
  ViewDelta,
  type ViewDeltaT,
  ViewFull,
  type ViewFullT,
  WatchBattleT,
  type WinHoldT,
} from "../gen/wire";
import { settings } from "../settings";
import { type CommandKind, createLocalStore, updateLastSeen } from "./local";
import {
  type Army,
  applyDelta,
  type Battle,
  type Battlefield,
  type BattleReport,
  createMatchStore,
  type DefenceLayout,
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
  type SquadOrder,
  type View,
  type Volley,
} from "./store";

const WIRE_KINDS = {
  move: BattleOrderKind.Move,
  attack: BattleOrderKind.Attack,
  attackMove: BattleOrderKind.AttackMove,
  hold: BattleOrderKind.Hold,
} as const;

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
      team: s.team,
    })),
    spectators: t.spectators.map((s) => ({
      user: str(s.user),
      displayName: str(s.displayName),
    })),
    teams: t.teams,
    winner: t.winner < 0 ? null : t.winner,
    endReason: str(t.endReason),
  };
}

const toWinHold = (h: WinHoldT) => ({
  seat: h.seat < 0 ? null : h.seat,
  ends: Number(h.ends),
});

const STACKS_PER_PLANET = 3;

/** A TruceChanged's kind, by the wire's TruceKind. */
const TRUCE_KINDS = ["offered", "made", "declined", "lapsed", "ended"] as const;
export type TruceChange = {
  kind: (typeof TRUCE_KINDS)[number];
  from: number; // the offerer; for "ended", who ended it
  to: number; // the one offered; for "ended", the other
  attacked: boolean; // "ended" by attacking, not by choice
};

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
  stats: p.stats && {
    resources: toAmounts(p.stats.resources),
    income: toAmounts(p.stats.income),
    commandPointsUsed: p.stats.commandPointsUsed,
    commandPointsCap: p.stats.commandPointsCap,
  },
  team: p.team,
  truces: [...p.truces],
  offerFrom: Number(p.offerFrom),
  offerTo: Number(p.offerTo),
  retryAt: Number(p.retryAt),
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
  rallyPoint: str(p.rallyPoint ?? ""),
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
  raid: a.raid,
  tech: str(a.tech),
  homePlanet: str(a.homePlanet),
  homeSlot: a.homeSlot,
  destPlanet: str(a.destPlanet),
  destSlot: a.destSlot,
  turned: a.turned,
});

const side = (n: number): Side => (n === 0 ? "attacker" : "defender");

const toCell = (c: CellT | null) => ({ x: c?.x ?? 0, y: c?.y ?? 0 });
const toSite = (k: number) => (k < 0 ? null : k);

export const toLayout = (t: DefenceLayoutT): DefenceLayout => ({
  planet: str(t.planet),
  field: t.field
    ? toField(t.field)
    : { width: 0, height: 0, terrains: [], terrain: [], heights: [] },
  commandPost: toCell(t.commandPost),
  sites: t.sites.map(toCell),
  points: t.points.map(toCell),
  landings: t.landings.map(toCell),
  pads: t.pads.map(toCell),
  reach: t.reach,
  buildingSites: t.buildingSites.map(toSite),
  stackStarts: t.stackStarts.map(toCell),
  setSites: t.setSites.map(toSite),
  setStarts: new Map(t.setStarts.map((s) => [s.stack, { x: s.x, y: s.y }])),
  setPost: toSite(t.setPost),
});

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
    commandPost: q.commandPost,
    goal: q.moving ? { x: q.goalX, y: q.goalY } : null,
    target: q.target,
    dropship: q.dropship,
    queue: q.queue.map((w) => ({ x: w.x, y: w.y, attack: w.attack })),
  })),
  points: b.points.map((p) => ({
    x: p.x,
    y: p.y,
    owner: p.owner > 1 ? null : side(p.owner), // 255: nobody's
    taker: p.taker > 1 ? null : side(p.taker),
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
    coolsAt: p.coolsAt,
  })),
  tickRate: b.tickRate,
  retreatAt: b.retreatAt,
  retreating: {
    attacker: b.attackerRetreating,
    defender: b.defenderRetreating,
  },
  raid: b.raid,
  buildingsLeft: b.buildingsLeft,
  buildings: b.buildings,
  zonesHeld: b.zonesHeld,
  commanded: b.commanded,
  summary: b.summary,
  damage: { attacker: b.attackerDamage, defender: b.defenderDamage },
  drops: b.drops.map((d) => ({
    unit: str(d.unit),
    units: d.units,
    state: DROP_STATES[d.state] ?? "done",
    point: d.point < 0 ? null : d.point,
    aiAt: d.aiAt,
  })),
});

const DROP_STATES = {
  [DropState.Orbit]: "orbit",
  [DropState.Flying]: "flying",
  [DropState.Done]: "done",
} as const;

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
  rates: new Map(r.fields.map((f) => [str(f.field), f.rate])),
  projects: r.projects.map((p) => ({
    tech: str(p.tech),
    planet: str(p.planet),
    slot: p.slot,
    cost: p.cost,
    done: p.done,
    since: Number(p.since),
    rate: p.rate,
  })),
  hands: new Map(
    r.fields
      .filter((f) => f.hand.length > 0)
      .map((f) => [str(f.field), f.hand.map(str)]),
  ),
  saved: r.saved.map((v) => ({
    tech: str(v.tech),
    cost: v.cost,
    done: v.done,
    lost: v.lost,
  })),
});

const NO_RESEARCH: Research = {
  rates: new Map(),
  projects: [],
  hands: new Map(),
  saved: [],
};

/** user is the signed-in player: a Spectator's View doesn't say which Seat, if any, is theirs. */
function toView(t: ViewFullT, user: string): View {
  const players = t.players.map(toPlayer);
  return {
    matchTime: Number(t.matchTime),
    contentHash: str(t.contentHash),
    ruleset: str(t.ruleset),
    map: str(t.map),
    you: t.spectating ? players.findIndex((p) => p.user === user) : t.you,
    spectating: t.spectating,
    players,
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
 * "battleEnded" {battle, planet, winner}, "raidTurnedBack" {planet} for a Raid
 * that found no buildings, "eliminated" {seat}, and
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
    this.unsubscribe();
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

  /** Gives up your Seat to watch. */
  spectate() {
    this.send(Op.Spectate, "seat", (seq) => new SpectateT(seq));
  }

  /** A Spectator takes a free Seat. */
  takeSeat() {
    this.send(Op.TakeSeat, "seat", (seq) => new TakeSeatT(seq));
  }

  /** Host only: Teams on (Seats split between Teams 1 and 2) or off. */
  setTeams(on: boolean) {
    this.send(Op.SetTeams, "teams", (seq) => new SetTeamsT(seq, on));
  }

  /** Moves a Seat (user's) to team, 1–4: your own, or for the Host a Bot's. */
  setTeam(user: string, team: number) {
    this.send(Op.SetTeam, "team", (seq) => new SetTeamT(seq, user, team));
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
    raid = false,
  ) {
    const list = units.map((u) => new ArmyUnitsT(u.stack, u.unit, u.count));
    this.send(
      Op.OrderArmy,
      "order",
      (seq) => new OrderArmyT(seq, from, list, to, toStack, raid),
    );
  }

  reorderArmy(army: number, to: string, toStack: number, raid = false) {
    this.send(
      Op.ReorderArmy,
      "order",
      (seq) => new ReorderArmyT(seq, army, to, toStack, raid),
    );
  }

  // Settings' Battles choice, sent again whenever it changes.
  private readonly unsubscribe = settings.subscribe((s, prev) => {
    if (s.battles !== prev.battles) this.sendBattleControl();
  });

  private sendBattleControl() {
    const view = this.store.getState().view;
    if (view && !view.spectating)
      this.setBattleControl(settings.getState().battles === "command");
  }

  /** Your default for Battles from now on: command them, or Auto. */
  setBattleControl(command: boolean) {
    this.send(
      Op.SetBattleControl,
      "battleControl",
      (seq) => new SetBattleControlT(seq, command),
    );
  }

  /** The Battle you have open, by its Planet ("" none): only its view carries positions and fire. */
  watchBattle(planet: string) {
    this.send(Op.WatchBattle, "watch", (seq) => new WatchBattleT(seq, planet));
  }

  /** Offers another player a Truce (#81). */
  offerTruce(seat: number) {
    this.send(Op.OfferTruce, "truce", (seq) => new OfferTruceT(seq, seat));
  }

  /** Accepts or declines another player's open offer of a Truce. */
  answerTruce(seat: number, accept: boolean) {
    this.send(
      Op.AnswerTruce,
      "truce",
      (seq) => new AnswerTruceT(seq, seat, accept),
    );
  }

  /** Ends a Truce with another player, at once. */
  endTruce(seat: number) {
    this.send(Op.EndTruce, "truce", (seq) => new EndTruceT(seq, seat));
  }

  /** Whether you command your side of the Battle on planet: only in its setup. */
  setBattleCommand(planet: string, command: boolean) {
    this.send(
      Op.SetBattleCommand,
      "battleCommand",
      (seq) => new SetBattleCommandT(seq, planet, command),
    );
  }

  /** Asks for your Planet's defence layout; it arrives in local.layout. */
  requestLayout(planet: string) {
    this.send(
      Op.RequestDefenceLayout,
      "layout",
      (seq) => new RequestDefenceLayoutT(seq, planet),
    );
  }

  /**
   * Sets your Planet's defence layout, whole: each Building Slot's site (null
   * its default), each Stack's start, and the Command Post's site (null the
   * base's own spot).
   */
  setLayout(
    planet: string,
    sites: (number | null)[],
    starts: Map<number, { x: number; y: number }>,
    post: number | null = null,
  ) {
    this.send(
      Op.SetDefenceLayout,
      "layout",
      (seq) =>
        new SetDefenceLayoutT(
          seq,
          planet,
          sites.map((k) => k ?? -1),
          [...starts].map(([k, c]) => new LayoutStartT(k, c.x, c.y)),
          post ?? -1,
        ),
    );
  }

  /** Orders squads in the Battle on planet, which you command. */
  battleOrder(planet: string, squads: number[], o: SquadOrder) {
    this.send(
      Op.BattleOrder,
      "battleOrder",
      (seq) =>
        new BattleOrderT(
          seq,
          planet,
          WIRE_KINDS[o.kind],
          squads,
          o.cell?.x ?? 0,
          o.cell?.y ?? 0,
          o.target ?? 0,
          o.queue ?? false,
        ),
    );
  }

  /** Sends one of your side's Dropships, by its index in Battle.drops, to Landing Zone point. */
  battleLand(planet: string, drop: number, point: number) {
    this.send(
      Op.BattleLand,
      "battleOrder",
      (seq) => new BattleLandT(seq, planet, drop, point),
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

  /** Sends planet's trained units on to another of your Planets; "" keeps them. */
  setRallyPoint(planet: string, to: string) {
    this.send(
      Op.SetRallyPoint,
      "rally",
      (seq) => new SetRallyPointT(seq, planet, to),
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

  /** Pays to send a held Tech to the Lab in slot of planet, as a Courier. */
  sendTech(tech: string, planet: string, slot: number) {
    this.send(
      Op.SendTech,
      "courier",
      (seq) => new SendTechT(seq, tech, planet, slot),
    );
  }

  /** Sends a Courier to the Lab in slot of planet, or back to the one it left. */
  reorderCourier(army: number, planet: string, slot: number) {
    this.send(
      Op.ReorderCourier,
      "courier",
      (seq) => new ReorderCourierT(seq, army, planet, slot),
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
        const mine = [...t.seats, ...t.spectators].find(
          (s) => str(s.user) === this.userId,
        );
        if (mine) this.settle(mine.lastSeq);
        return;
      }
      case Op.ViewFull: {
        const view = toView(
          ViewFull.getRootAsViewFull(bb).unpack(),
          this.userId,
        );
        this.debug("ViewFull", view);
        this.syncClock(view.matchTime);
        for (const b of view.battles.values())
          if (b.field) this.fields.set(b.id, b.field);
        this.store.setState({ view });
        this.seedReports(view.battles.values());
        this.sendBattleControl(); // joining, or back after a drop: the server takes it from here
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
      case Op.RaidTurnedBack: {
        const t = RaidTurnedBack.getRootAsRaidTurnedBack(bb).unpack();
        this.debug("RaidTurnedBack", t);
        this.syncClock(Number(t.matchTime));
        this.events.dispatchEvent(
          new CustomEvent("raidTurnedBack", {
            detail: { planet: str(t.planet) },
          }),
        );
        return;
      }
      case Op.TruceChanged: {
        const t = TruceChanged.getRootAsTruceChanged(bb).unpack();
        this.debug("TruceChanged", t);
        this.syncClock(Number(t.matchTime));
        this.emit("truceChanged", {
          kind: TRUCE_KINDS[t.kind] ?? "ended",
          from: t.from,
          to: t.to,
          attacked: t.attacked,
        });
        return;
      }
      case Op.DefenceLayout: {
        const t = DefenceLayoutMsg.getRootAsDefenceLayout(bb).unpack();
        this.debug("DefenceLayout", t);
        this.local.setState({ layout: toLayout(t) });
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
          started: Number(t.started),
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
        this.setReport(t.battle, (r) => r && reportVolleys(r, volleys));
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
