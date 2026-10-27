import type { MatchData, Session } from "@heroiclabs/nakama-js";
import * as flatbuffers from "flatbuffers";
import { describe, expect, it, vi } from "vitest";
import {
  AmountT,
  ArmyViewT,
  BattleActionT,
  BattleRoundT,
  BattleViewT,
  CombatantT,
  EconomyT,
  LobbyStateT,
  MatchEndedT,
  MoveUnits,
  Op,
  OrderArmy,
  PaydayPaidT,
  Phase,
  PlanetCapturedT,
  PlanetViewT,
  PlayerViewT,
  QueueBuilding,
  QueueItemT,
  QueueUnit,
  SeatT,
  StackT,
  UnitSlotT,
  ViewDeltaT,
  ViewFullT,
  WinHoldT,
} from "../gen/wire";
import { MatchConnection, type SocketLike } from "./connection";

function fakeSocket() {
  const calls: string[] = [];
  const socket: SocketLike = {
    onmatchdata: () => {},
    ondisconnect: () => {},
    connect: async () => {
      calls.push("connect");
      return {} as Session;
    },
    joinMatch: async (id: string) => {
      calls.push(`join ${id}`);
      return {} as never;
    },
    leaveMatch: async (id: string) => {
      calls.push(`leave ${id}`);
    },
    disconnect: () => {
      calls.push("disconnect");
    },
    sendMatchState: async () => {},
  };
  const send = (op: number, data: Uint8Array) =>
    socket.onmatchdata({ op_code: op, data } as MatchData);
  return { socket, calls, send };
}

function lobbyBytes(): Uint8Array {
  const b = new flatbuffers.Builder();
  const state = new LobbyStateT(
    Phase.Lobby,
    "u1",
    "base:quadrant",
    [new AmountT("base:credits", 1000), new AmountT("base:materials", 300)],
    [
      new SeatT("u1", "Chief", "base:unsc", true),
      new SeatT("u2", "Arbiter", "base:covenant", false),
    ],
  );
  b.finish(state.pack(b));
  return b.asUint8Array();
}

describe("MatchConnection", () => {
  it("connects, then joins the Match; close leaves and disconnects", async () => {
    const { socket, calls } = fakeSocket();
    const conn = new MatchConnection(socket);

    await conn.open({} as Session, "m1");
    await conn.close();

    expect(calls).toEqual(["connect", "join m1", "leave m1", "disconnect"]);
  });

  it("decodes LobbyState into plain objects in the Match store", async () => {
    const { socket, send } = fakeSocket();
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");

    send(Op.LobbyState, lobbyBytes());

    expect(conn.store.getState().lobby).toEqual({
      phase: "lobby",
      host: "u1",
      map: "base:quadrant",
      startingResources: new Map([
        ["base:credits", 1000],
        ["base:materials", 300],
      ]),
      seats: [
        { user: "u1", displayName: "Chief", faction: "base:unsc", ready: true },
        {
          user: "u2",
          displayName: "Arbiter",
          faction: "base:covenant",
          ready: false,
        },
      ],
      winner: null,
      endReason: "",
    });
  });

  it("decodes ViewFull into plain objects, Planets in a Map by id", async () => {
    const { socket, send } = fakeSocket();
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");
    const b = new flatbuffers.Builder();
    const view = new ViewFullT(
      2000n,
      "hash1",
      "base:rules",
      "base:quadrant",
      1,
      [
        new PlayerViewT(0, "u1", "Chief", "base:unsc", 1),
        new PlayerViewT(1, "u2", "Arbiter", "base:covenant", 1),
      ],
      [
        new PlanetViewT(
          "harvest",
          1,
          true,
          false,
          ["base:hall", ""],
          [
            new StackT([new UnitSlotT("base:grunt", 10)]),
            new StackT([]),
            new StackT([]),
          ],
        ),
        new PlanetViewT("jericho", -1, false, false, ["", "", ""], []),
      ],
      new EconomyT([new AmountT("base:credits", -20)], 16, 20, 0n, 90000n),
      [
        new ArmyViewT(
          4,
          1,
          [new UnitSlotT("base:grunt", 3)],
          "harvest",
          "jericho",
          1000n,
          31000n,
          false,
          "reach",
          2,
        ),
      ],
    );
    b.finish(view.pack(b));

    send(Op.ViewFull, b.asUint8Array());

    expect(conn.store.getState().view).toEqual({
      matchTime: 2000,
      contentHash: "hash1",
      ruleset: "base:rules",
      map: "base:quadrant",
      you: 1,
      players: [
        {
          seat: 0,
          user: "u1",
          displayName: "Chief",
          faction: "base:unsc",
          planetCount: 1,
          eliminated: false,
          connected: false,
          graceEnds: 0,
        },
        {
          seat: 1,
          user: "u2",
          displayName: "Arbiter",
          faction: "base:covenant",
          planetCount: 1,
          eliminated: false,
          connected: false,
          graceEnds: 0,
        },
      ],
      planets: new Map([
        [
          "harvest",
          {
            id: "harvest",
            owner: 1,
            capital: true,
            locked: false,
            buildings: ["base:hall", ""],
            stacks: [[{ unit: "base:grunt", count: 10 }], [], []],
            queue: [],
            unitQueue: [],
            rallyStack: 0,
          },
        ],
        [
          "jericho",
          {
            id: "jericho",
            owner: null,
            capital: false,
            locked: false,
            buildings: ["", "", ""],
            stacks: [[], [], []],
            queue: [],
            unitQueue: [],
            rallyStack: 0,
          },
        ],
      ]),
      economy: {
        resources: new Map([["base:credits", -20]]),
        commandPointsUsed: 16,
        commandPointsCap: 20,
        paydayStart: 0,
        paydayEnd: 90000,
      },
      armies: new Map([
        [
          4,
          {
            id: 4,
            owner: 1,
            units: [{ unit: "base:grunt", count: 3 }],
            from: "harvest",
            to: "jericho",
            departed: 1000,
            arrives: 31000,
            waiting: false,
            destination: "reach",
            toStack: 2,
          },
        ],
      ]),
      battles: new Map(),
      winHold: { seat: null, ends: 0 },
    });
  });

  function pack(t: { pack(b: flatbuffers.Builder): number }) {
    const b = new flatbuffers.Builder();
    b.finish(t.pack(b));
    return b.asUint8Array();
  }

  async function playing() {
    const { socket, send } = fakeSocket();
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");
    const planet = (id: string, owner: number) =>
      new PlanetViewT(id, owner, false, false, [""], []);
    send(
      Op.ViewFull,
      pack(
        new ViewFullT(
          0n,
          "hash1",
          "base:rules",
          "base:quadrant",
          0,
          [
            new PlayerViewT(0, "u1", "Chief", "base:unsc", 2),
            new PlayerViewT(1, "u2", "Arbiter", "base:covenant", 1),
          ],
          [planet("a", 0), planet("b", 0), planet("c", -1)],
          new EconomyT([new AmountT("base:credits", 1000)], 0, 20, 0n, 90000n),
        ),
      ),
    );
    return { conn, send };
  }

  it("applies a ViewDelta: upserts, removals and the new economy", async () => {
    const { conn, send } = await playing();

    send(
      Op.ViewDelta,
      pack(
        new ViewDeltaT(
          90000n,
          [new PlayerViewT(0, "u1", "Chief", "base:unsc", 1)],
          [new PlanetViewT("b", -1, false, false, [""], [])],
          ["c"],
          new EconomyT(
            [new AmountT("base:credits", 1300)],
            0,
            10,
            90000n,
            180000n,
          ),
        ),
      ),
    );

    const view = conn.store.getState().view;
    expect(view?.matchTime).toBe(90000);
    expect(view?.players.map((p) => p.planetCount)).toEqual([1, 1]);
    expect([...(view?.planets.keys() ?? [])]).toEqual(["a", "b"]);
    expect(view?.planets.get("b")?.owner).toBeNull();
    expect(view?.economy).toEqual({
      resources: new Map([["base:credits", 1300]]),
      commandPointsUsed: 0,
      commandPointsCap: 10,
      paydayStart: 90000,
      paydayEnd: 180000,
    });
  });

  it("keeps the economy when a ViewDelta doesn't carry one", async () => {
    const { conn, send } = await playing();
    const before = conn.store.getState().view?.economy;

    send(Op.ViewDelta, pack(new ViewDeltaT(1000n, [], [], ["c"], null)));

    expect(conn.store.getState().view?.economy).toBe(before);
    expect(conn.store.getState().view?.planets.has("c")).toBe(false);
  });

  it("sets the clock offset from each message's Match Time", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(5000);
    const { conn, send } = await playing();
    expect(conn.local.getState().clockOffset).toBe(-5000);

    send(Op.ViewDelta, pack(new ViewDeltaT(2000n, [], [], ["c"], null)));

    expect(conn.local.getState().clockOffset).toBe(-3000);
    now.mockRestore();
  });

  it("decodes a Planet's construction and unit queues", async () => {
    const { conn, send } = await playing();
    const planet = new PlanetViewT(
      "a",
      0,
      false,
      false,
      ["", ""],
      [],
      [
        new QueueItemT(7, 1, "base:barracks", "", true, false, 30200n, 0n),
        new QueueItemT(8, 0, "base:supply-pad", "", false, false, 0n, 30000n),
      ],
      [new QueueItemT(9, 0, "", "base:marine", true, true, 0n, 4000n)],
      2,
    );

    send(Op.ViewDelta, pack(new ViewDeltaT(200n, [], [planet], [], null)));

    expect(conn.store.getState().view?.planets.get("a")?.queue).toEqual([
      {
        id: 7,
        slot: 1,
        building: "base:barracks",
        unit: "",
        started: true,
        paused: false,
        endsAt: 30200,
        remaining: 0,
      },
      {
        id: 8,
        slot: 0,
        building: "base:supply-pad",
        unit: "",
        started: false,
        paused: false,
        endsAt: 0,
        remaining: 30000,
      },
    ]);
    const a = conn.store.getState().view?.planets.get("a");
    expect(a?.unitQueue).toEqual([
      {
        id: 9,
        slot: 0,
        building: "",
        unit: "base:marine",
        started: true,
        paused: true,
        endsAt: 0,
        remaining: 4000,
      },
    ]);
    expect(a?.rallyStack).toBe(2);
  });

  it("sends construction and unit commands, pending until settled", async () => {
    const { socket } = fakeSocket();
    const sent: [number, Uint8Array][] = [];
    socket.sendMatchState = async (_id, op, data) => {
      sent.push([op, data as Uint8Array]);
    };
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");

    conn.queueBuilding("a", 2, "base:barracks");
    conn.cancelQueueItem(7);
    conn.sellBuilding("a", 0);
    conn.queueUnit("a", 0, "base:marine", 5);
    conn.moveUnits("a", 0, 2, "base:marine", 3);
    conn.setRallyStack("a", 1);
    conn.surrender();

    expect(sent.map(([op]) => op)).toEqual([
      Op.QueueBuilding,
      Op.CancelQueueItem,
      Op.SellBuilding,
      Op.QueueUnit,
      Op.MoveUnits,
      Op.SetRallyStack,
      Op.Surrender,
    ]);
    const bb = (i: number) =>
      new flatbuffers.ByteBuffer(sent[i]?.[1] ?? new Uint8Array());
    const u = QueueUnit.getRootAsQueueUnit(bb(3)).unpack();
    expect([u.planet, u.slot, u.unit, u.count]).toEqual([
      "a",
      0,
      "base:marine",
      5,
    ]);
    const m = MoveUnits.getRootAsMoveUnits(bb(4)).unpack();
    expect([m.fromStack, m.toStack, m.unit, m.count]).toEqual([
      0,
      2,
      "base:marine",
      3,
    ]);
    const q = QueueBuilding.getRootAsQueueBuilding(
      new flatbuffers.ByteBuffer(sent[0]?.[1] ?? new Uint8Array()),
    ).unpack();
    expect([q.seq, q.planet, q.slot, q.building]).toEqual([
      1,
      "a",
      2,
      "base:barracks",
    ]);
    expect([...conn.local.getState().pending.values()]).toEqual([
      "build",
      "cancel",
      "sell",
      "train",
      "move",
      "rally",
      "surrender",
    ]);
  });

  it("applies Armies in a ViewDelta: upserts and removals", async () => {
    const { conn, send } = await playing();
    const army = (id: number, to: string) =>
      new ArmyViewT(id, 0, [], "a", to, 0n, 30000n, false, to, 0);
    send(
      Op.ViewDelta,
      pack(
        new ViewDeltaT(0n, [], [], [], null, [army(1, "b"), army(2, "c")], []),
      ),
    );

    send(
      Op.ViewDelta,
      pack(new ViewDeltaT(100n, [], [], [], null, [army(2, "b")], [1])),
    );

    const armies = conn.store.getState().view?.armies;
    expect([...(armies?.keys() ?? [])]).toEqual([2]);
    expect(armies?.get(2)?.to).toBe("b");
  });

  it("applies Battles in a ViewDelta and sends Rounds out as events", async () => {
    const { conn, send } = await playing();
    const rounds: unknown[] = [];
    conn.events.addEventListener("battleRound", (e) =>
      rounds.push((e as CustomEvent).detail),
    );
    const battle = new BattleViewT(5, "c", 0, -1, 3000n, 3000, 1, [
      new CombatantT("a0001", 0, "base:marine", 0, 0, 100),
      new CombatantT("d0001", 1, "base:grunt", 9.5, 0, 70),
    ]);

    send(
      Op.ViewDelta,
      pack(new ViewDeltaT(3000n, [], [], [], null, [], [], [battle], [])),
    );
    send(
      Op.BattleRound,
      pack(
        new BattleRoundT(3000n, 5, "c", 2, [
          new BattleActionT("a0001", "d0001", "base:kinetic", 9.5, 0, 5, false),
        ]),
      ),
    );

    expect(conn.store.getState().view?.battles.get(5)).toEqual({
      id: 5,
      planet: "c",
      attacker: 0,
      defender: null,
      started: 3000,
      roundMs: 3000,
      round: 1,
      roster: [
        {
          id: "a0001",
          side: "attacker",
          unit: "base:marine",
          shield: 0,
          armor: 0,
          hp: 100,
        },
        {
          id: "d0001",
          side: "defender",
          unit: "base:grunt",
          shield: 9.5,
          armor: 0,
          hp: 70,
        },
      ],
    });
    expect(rounds).toEqual([
      {
        battle: 5,
        round: 2,
        actions: [
          {
            actor: "a0001",
            target: "d0001",
            weapon: "base:kinetic",
            shieldDmg: 9.5,
            armorDmg: 0,
            hpDmg: 5,
            killed: false,
          },
        ],
      },
    ]);

    send(
      Op.ViewDelta,
      pack(new ViewDeltaT(9000n, [], [], [], null, [], [], [], [5])),
    );
    expect(conn.store.getState().view?.battles.size).toBe(0);
  });

  it("applies the win-hold from a ViewDelta and sends MatchEnded out", async () => {
    const { conn, send } = await playing();
    const ended: unknown[] = [];
    conn.events.addEventListener("matchEnded", (e) =>
      ended.push((e as CustomEvent).detail),
    );

    send(
      Op.ViewDelta,
      pack(
        new ViewDeltaT(
          1000n,
          [],
          [],
          [],
          null,
          [],
          [],
          [],
          [],
          new WinHoldT(0, 91000n),
        ),
      ),
    );
    send(Op.MatchEnded, pack(new MatchEndedT(91000n, 0, "hold")));

    expect(conn.store.getState().view?.winHold).toEqual({
      seat: 0,
      ends: 91000,
    });
    expect(ended).toEqual([{ winner: 0, reason: "hold" }]);
  });

  it("keeps a last-seen copy of a Planet that leaves vision", async () => {
    const { conn, send } = await playing();
    const c = conn.store.getState().view?.planets.get("c");

    send(Op.ViewDelta, pack(new ViewDeltaT(42000n, [], [], ["c"], null)));

    expect(conn.store.getState().view?.planets.has("c")).toBe(false);
    expect(conn.local.getState().lastSeen.get("c")).toEqual({
      planet: c,
      seenAt: 42000,
    });
  });

  it("leaves a lost Planet's queues out of its last-seen copy", async () => {
    const { conn, send } = await playing();
    const mine = new PlanetViewT(
      "b",
      0,
      false,
      false,
      [""],
      [],
      [new QueueItemT(7, 0, "base:barracks", "", true, false, 30000n, 0n)],
    );
    send(Op.ViewDelta, pack(new ViewDeltaT(1000n, [], [mine], [], null)));

    send(Op.ViewDelta, pack(new ViewDeltaT(2000n, [], [], ["b"], null)));

    const copy = conn.local.getState().lastSeen.get("b")?.planet;
    expect(copy?.owner).toBe(0);
    expect(copy?.queue).toEqual([]);
  });

  it("drops the copy when the Planet comes back into vision", async () => {
    const { conn, send } = await playing();
    send(Op.ViewDelta, pack(new ViewDeltaT(1000n, [], [], ["c"], null)));

    const back = new PlanetViewT("c", 1, false, false, [""], []);
    send(Op.ViewDelta, pack(new ViewDeltaT(5000n, [], [back], [], null)));

    expect(conn.local.getState().lastSeen.has("c")).toBe(false);
    expect(conn.store.getState().view?.planets.get("c")?.owner).toBe(1);
  });

  it("drops copies a ViewFull brings back into vision", async () => {
    const { conn, send } = await playing();
    send(Op.ViewDelta, pack(new ViewDeltaT(1000n, [], [], ["c"], null)));

    send(
      Op.ViewFull,
      pack(
        new ViewFullT(
          2000n,
          "hash1",
          "base:rules",
          "base:quadrant",
          0,
          [],
          [new PlanetViewT("c", -1, false, false, [""], [])],
        ),
      ),
    );

    expect(conn.local.getState().lastSeen.size).toBe(0);
  });

  it("sends PlanetCaptured out as a captured event", async () => {
    const { conn, send } = await playing();
    const got: unknown[] = [];
    conn.events.addEventListener("captured", (e) =>
      got.push((e as CustomEvent).detail),
    );

    send(Op.PlanetCaptured, pack(new PlanetCapturedT(30000n, "c", -1, 0)));

    expect(got).toEqual([{ planet: "c", from: null, to: 0 }]);
  });

  it("sends OrderArmy with each Stack and unit", async () => {
    const { socket } = fakeSocket();
    const sent: Uint8Array[] = [];
    socket.sendMatchState = async (_id, _op, data) => {
      sent.push(data as Uint8Array);
    };
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");

    conn.orderArmy(
      "a",
      [
        { stack: 0, unit: "base:marine", count: 4 },
        { stack: 2, unit: "base:odst", count: 1 },
      ],
      "b",
      1,
    );

    const o = OrderArmy.getRootAsOrderArmy(
      new flatbuffers.ByteBuffer(sent[0] ?? new Uint8Array()),
    ).unpack();
    expect([o.fromPlanet, o.toPlanet, o.toStack]).toEqual(["a", "b", 1]);
    expect(o.units.map((u) => [u.stack, u.unit, u.count])).toEqual([
      [0, "base:marine", 4],
      [2, "base:odst", 1],
    ]);
  });

  it("sends PaydayPaid out as a payday event", async () => {
    const { conn, send } = await playing();
    const got: Map<string, number>[] = [];
    conn.events.addEventListener("payday", (e) =>
      got.push((e as CustomEvent<Map<string, number>>).detail),
    );

    send(
      Op.PaydayPaid,
      pack(new PaydayPaidT(90000n, [new AmountT("base:credits", -40)])),
    );

    expect(got).toEqual([new Map([["base:credits", -40]])]);
  });

  it("marks the Match store disconnected when the socket drops", async () => {
    const { socket } = fakeSocket();
    const conn = new MatchConnection(socket, { log: false });
    await conn.open({} as Session, "m1");
    expect(conn.store.getState().disconnected).toBe(false);

    socket.ondisconnect(new Event("close"));

    expect(conn.store.getState().disconnected).toBe(true);
  });

  it("logs each message as JSON when logging is on", async () => {
    const { socket, send } = fakeSocket();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const conn = new MatchConnection(socket, { log: true });
    await conn.open({} as Session, "m1");

    send(Op.LobbyState, lobbyBytes());

    expect(debug).toHaveBeenCalledWith(
      "[match] LobbyState",
      expect.stringContaining('"base:credits":1000'),
    );
    debug.mockRestore();
  });
});
