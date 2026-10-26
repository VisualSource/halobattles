import type { MatchData, Session } from "@heroiclabs/nakama-js";
import * as flatbuffers from "flatbuffers";
import { describe, expect, it, vi } from "vitest";
import { AmountT, LobbyStateT, Op, Phase, SeatT } from "../gen/wire";
import { MatchConnection, type SocketLike } from "./connection";

function fakeSocket() {
  const calls: string[] = [];
  const socket: SocketLike = {
    onmatchdata: () => {},
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
