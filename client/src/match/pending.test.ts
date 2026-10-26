import type { MatchData, Session } from "@heroiclabs/nakama-js";
import * as flatbuffers from "flatbuffers";
import { describe, expect, it } from "vitest";
import { CommandRejectedT, LobbyStateT, Op, Phase, SeatT } from "../gen/wire";
import { MatchConnection, type SocketLike } from "./connection";

function bytes(t: { pack(b: flatbuffers.Builder): number }) {
  const b = new flatbuffers.Builder();
  b.finish(t.pack(b));
  return b.asUint8Array();
}

function setup() {
  const sent: { op: number; data: Uint8Array }[] = [];
  const socket: SocketLike = {
    onmatchdata: () => {},
    connect: async () => ({}) as Session,
    joinMatch: async () => ({}) as never,
    leaveMatch: async () => {},
    disconnect: () => {},
    sendMatchState: async (_id: string, op: number, data: unknown) => {
      sent.push({ op, data: data as Uint8Array });
    },
  };
  const conn = new MatchConnection(socket, { log: false });
  const receive = (op: number, data: Uint8Array) =>
    socket.onmatchdata({ op_code: op, data } as MatchData);
  const lobby = (lastSeq: number, ready = false) =>
    receive(
      Op.LobbyState,
      bytes(
        new LobbyStateT(
          Phase.Lobby,
          "me",
          "base:quadrant",
          [],
          [
            new SeatT("me", "Me", "base:unsc", ready, lastSeq),
            new SeatT("other", "Other", "base:unsc", false, 99),
          ],
        ),
      ),
    );
  const pending = () => [...conn.local.getState().pending.entries()];
  return { conn, sent, receive, lobby, pending };
}

const session = { user_id: "me" } as Session;

describe("pending commands", () => {
  it("are sent with increasing seqs and tracked until the server has processed them", async () => {
    const { conn, sent, lobby, pending } = setup();
    await conn.open(session, "m1");

    conn.setReady(true);
    conn.setFaction("base:covenant");

    expect(sent.map((s) => s.op)).toEqual([Op.SetReady, Op.SetFaction]);
    expect(pending()).toEqual([
      [1, "ready"],
      [2, "faction"],
    ]);

    lobby(1, true); // the server has processed seq 1 only
    expect(pending()).toEqual([[2, "faction"]]);

    lobby(2);
    expect(pending()).toEqual([]);
  });

  it("settles even when the change was undone in the same tick", async () => {
    const { conn, lobby, pending } = setup();
    await conn.open(session, "m1");

    conn.setReady(true);
    // The Host changed the map in the same tick, clearing every ready flag.
    lobby(1, false);

    expect(pending()).toEqual([]);
  });

  it("turn into a toast with the reason when rejected", async () => {
    const { conn, receive, pending } = setup();
    await conn.open(session, "m1");

    const toasts: string[] = [];
    conn.events.addEventListener("rejected", (e) =>
      toasts.push((e as CustomEvent<string>).detail),
    );
    conn.setMap("base:quadrant");
    receive(
      Op.CommandRejected,
      bytes(new CommandRejectedT(1, "only the Host can do that")),
    );

    expect(pending()).toEqual([]);
    expect(toasts).toEqual(["only the Host can do that"]);
  });

  it("ignore other Seats' last seq", async () => {
    const { conn, lobby, pending } = setup();
    await conn.open(session, "m1");

    conn.startMatch();
    lobby(0); // "other" has last_seq 99, but that's not us

    expect(pending()).toEqual([[1, "start"]]);
  });
});
