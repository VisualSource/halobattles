import type { MatchData, Session } from "@heroiclabs/nakama-js";
import * as flatbuffers from "flatbuffers";
import { describe, expect, it, vi } from "vitest";
import {
  AmountT,
  LobbyStateT,
  Op,
  Phase,
  PlanetViewT,
  PlayerViewT,
  SeatT,
  StackT,
  UnitSlotT,
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
    });
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
