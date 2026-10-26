import type { MatchData, Session } from "@heroiclabs/nakama-js";
import * as flatbuffers from "flatbuffers";
import { describe, expect, it, vi } from "vitest";
import {
  AmountT,
  EconomyT,
  LobbyStateT,
  Op,
  PaydayPaidT,
  Phase,
  PlanetViewT,
  PlayerViewT,
  SeatT,
  StackT,
  UnitSlotT,
  ViewDeltaT,
  ViewFullT,
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
        },
        {
          seat: 1,
          user: "u2",
          displayName: "Arbiter",
          faction: "base:covenant",
          planetCount: 1,
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
