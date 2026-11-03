import type { Session } from "@heroiclabs/nakama-js";
import { createStore } from "zustand/vanilla";
import { client, createSocket } from "../config";
import type {
  Battle,
  Battlefield,
  BuildPad,
  Side,
  Squad,
  Volley,
} from "../match/store";

// The Battle Lab's connection: a dev-only battle_lab match on the server.
// shortcut: its messages are JSON (see server/internal/nakama/lab.go), not
// FlatBuffers; move them to the wire schema if the Lab ever ships.

const OP = { setup: 1, control: 2, replay: 3, order: 4 } as const;
const IN = { field: 100, frame: 101, error: 102 } as const;

type GoCell = { X: number; Y: number };

/** One side of a Lab Battle, as the setup form edits it. */
export type LabSide = {
  faction: string;
  units: { unit: string; count: number }[];
  buildings: string[]; // the defender's
  command: boolean;
};

export type LabSetup = {
  preset: string;
  seed: number;
  sides: [LabSide, LabSide];
};

export type Thinking = {
  tick: number;
  goals: {
    goal: string;
    cell: GoCell;
    target?: number;
    value: number;
    threat: number;
    need?: number;
    squads: number;
  }[];
  choices: { squad: number; goal: number; score: number; why: string }[];
  forces: {
    goal: string;
    cell: GoCell;
    target?: number;
    members: number[];
    stage: GoCell;
    going: boolean;
    formedAt: number;
    firesOn?: number;
  }[];
};

export type LabDecision = {
  side: number;
  tick: number;
  squad: number;
  unit: string;
  goal: string;
  target?: number;
  cell: GoCell;
  role?: string;
};

export type LabState = {
  field: Battlefield | null;
  battle: Battle | null;
  tick: number;
  setupTicks: number;
  over: boolean;
  winner: Side | null;
  reason: string;
  paused: boolean;
  speed: number;
  thinking: [Thinking | null, Thinking | null];
  log: LabDecision[]; // newest first, the last LOG_MAX
  error: string | null;
};

const LOG_MAX = 500;

const sideOf = (n: number): Side => (n === 0 ? "attacker" : "defender");
const bytes = (b64: string) =>
  Uint8Array.from(atob(b64 ?? ""), (c) => c.charCodeAt(0));

type GoSquad = {
  ID: number;
  Side: number;
  Unit: string;
  Building: boolean;
  Cell: GoCell;
  Count: number;
  Start: number;
  Front: { Shield: number; Armor: number; HP: number };
};
type GoFrame = {
  tick: number;
  setup: number;
  over: boolean;
  winner: number;
  reason?: string;
  paused: boolean;
  speed: number;
  snapshot: {
    Edge: number;
    Squads: GoSquad[] | null;
    Points:
      | { Cell: GoCell; Owner: number; Taker: number; Progress: number }[]
      | null;
    Pads:
      | {
          Cell: GoCell;
          Owner: number;
          Taker: number;
          Progress: number;
          Turret: number;
          Building: string;
          ReadyAt: number;
        }[]
      | null;
    Hold: number;
    HoldPaused: boolean;
    Retreating: [boolean, boolean];
  };
  volleys?: {
    Actor: number;
    Target: number;
    Shots: number;
    Hits: number;
    Kills: number;
    ShieldDmg: number;
    ArmorDmg: number;
    HPDmg: number;
  }[];
  thinking: [Thinking | null, Thinking | null];
  decisions?: LabDecision[];
};

/** A Lab frame as the match screens' Battle, so the same drawing shows it. */
export function toBattle(f: GoFrame, field: Battlefield): Battle {
  const s = f.snapshot;
  const squads: Squad[] = (s.Squads ?? []).map((q) => ({
    id: q.ID,
    side: sideOf(q.Side),
    unit: q.Unit,
    building: q.Building,
    x: q.Cell.X,
    y: q.Cell.Y,
    count: q.Count,
    start: q.Start,
    shield: q.Front.Shield,
    armor: q.Front.Armor,
    hp: q.Front.HP,
  }));
  const pads: BuildPad[] = (s.Pads ?? []).map((p) => ({
    x: p.Cell.X,
    y: p.Cell.Y,
    owner: p.Owner < 0 ? null : sideOf(p.Owner),
    taker: p.Taker < 0 ? null : sideOf(p.Taker),
    progress: p.Progress,
    turret: p.Turret,
    building: p.Building,
    readyAt: p.ReadyAt,
  }));
  return {
    id: 1,
    planet: "lab",
    attacker: 0,
    defender: 1,
    started: 0,
    tick: f.tick,
    edge: s.Edge,
    field,
    squads,
    points: (s.Points ?? []).map((p) => ({
      x: p.Cell.X,
      y: p.Cell.Y,
      owner: sideOf(p.Owner),
      taker: sideOf(p.Taker),
      progress: p.Progress,
    })),
    pads,
    hold: s.Hold,
    holdPaused: s.HoldPaused,
    retreatAt: 0,
    retreating: { attacker: s.Retreating[0], defender: s.Retreating[1] },
  };
}

export class LabConnection {
  readonly store = createStore<LabState>(() => ({
    field: null,
    battle: null,
    tick: 0,
    setupTicks: 0,
    over: false,
    winner: null,
    reason: "",
    paused: true,
    speed: 1,
    thinking: [null, null],
    log: [],
    error: null,
  }));
  /** Each tick's volleys, for tracers. */
  readonly events = new EventTarget();
  private readonly socket = createSocket();
  private matchId = "";

  async open(session: Session) {
    this.socket.onmatchdata = (m) => this.receive(m.op_code, m.data);
    await this.socket.connect(session, true);
    const res = await client.rpc(session, "lab_create", {});
    this.matchId = (res.payload as { matchId: string }).matchId;
    await this.socket.joinMatch(this.matchId);
  }

  async close() {
    if (this.matchId)
      await this.socket.leaveMatch(this.matchId).catch(() => {});
    this.socket.disconnect(false);
  }

  setup(s: LabSetup) {
    const side = (d: LabSide, defend: boolean) => ({
      faction: d.faction,
      // One Stack's 3 × 5 grid per 15 Unit Slots, as an Army deploys.
      formations: chunk(
        d.units.filter((u) => u.unit && u.count > 0),
        15,
      ).map((us) =>
        us.map((u, cell) => ({ unit: u.unit, count: u.count, cell })),
      ),
      buildings: defend ? d.buildings : undefined,
      command: d.command,
    });
    this.send(OP.setup, {
      preset: s.preset,
      seed: s.seed,
      attack: side(s.sides[0], false),
      defend: side(s.sides[1], true),
    });
  }

  control(c: {
    paused?: boolean;
    speed?: number;
    step?: number;
    restart?: boolean;
  }) {
    this.send(OP.control, c);
  }

  /** A Battle from a match log: its battleReplay line, and the log's map. */
  replay(map: string, replay: unknown) {
    this.send(OP.replay, { map, replay });
  }

  private send(op: number, v: unknown) {
    this.store.setState({ error: null });
    this.socket
      .sendMatchState(
        this.matchId,
        op,
        new TextEncoder().encode(JSON.stringify(v)),
      )
      .catch((e) => this.store.setState({ error: String(e) }));
  }

  private receive(op: number, data: Uint8Array) {
    const v = JSON.parse(new TextDecoder().decode(data));
    switch (op) {
      case IN.field: {
        const f = v as {
          W: number;
          H: number;
          Terrains: string[];
          Terrain: string;
          Height: string;
        };
        const field: Battlefield = {
          width: f.W,
          height: f.H,
          terrains: f.Terrains,
          terrain: [...bytes(f.Terrain)],
          heights: [...bytes(f.Height)],
        };
        this.store.setState({
          field,
          battle: null,
          log: [],
          thinking: [null, null],
        });
        return;
      }
      case IN.frame: {
        const f = v as GoFrame;
        const { field, log } = this.store.getState();
        if (!field) return;
        const volleys: Volley[] = (f.volleys ?? []).map((x) => ({
          actor: x.Actor,
          target: x.Target,
          shots: x.Shots,
          hits: x.Hits,
          kills: x.Kills,
          shieldDmg: x.ShieldDmg,
          armorDmg: x.ArmorDmg,
          hpDmg: x.HPDmg,
        }));
        this.store.setState({
          battle: toBattle(f, field),
          tick: f.tick,
          setupTicks: f.setup,
          over: f.over,
          winner: f.over ? sideOf(f.winner) : null,
          reason: f.reason ?? "",
          paused: f.paused,
          speed: f.speed,
          thinking: f.thinking,
          log: [...(f.decisions ?? []).reverse(), ...log].slice(0, LOG_MAX),
        });
        if (volleys.length)
          this.events.dispatchEvent(
            new CustomEvent("volleys", { detail: volleys }),
          );
        return;
      }
      case IN.error:
        this.store.setState({ error: (v as { error: string }).error });
        return;
    }
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out.length ? out : [[]];
}
