import type { MatchData, Session, Socket } from "@heroiclabs/nakama-js";
import { Builder, ByteBuffer } from "flatbuffers";
import {
  AmountT,
  CommandRejected,
  LobbyState,
  type LobbyStateT,
  Op,
  Phase,
  SetFactionT,
  SetMapT,
  SetReadyT,
  SetStartingResourcesT,
  StartMatchT,
} from "../gen/wire";
import { type CommandKind, createLocalStore } from "./local";
import { createMatchStore, type Lobby } from "./store";

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

function toLobby(t: LobbyStateT): Lobby {
  return {
    phase: phases[t.phase],
    host: str(t.host),
    map: str(t.map),
    startingResources: new Map(
      t.startingResources.map((a) => [str(a.resource), a.amount]),
    ),
    seats: t.seats.map((s) => ({
      user: str(s.user),
      displayName: str(s.displayName),
      faction: str(s.faction),
      ready: s.ready,
    })),
  };
}

/**
 * Owns the socket for one Match. It decodes every message to plain objects
 * at the edge and writes the Match store, and it sends commands, tracking
 * each by seq in the Local store until the server has processed it. One-off
 * events go out on `events`: "rejected" carries a refused command's reason.
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
      case Op.CommandRejected: {
        const t = CommandRejected.getRootAsCommandRejected(bb).unpack();
        this.debug("CommandRejected", t);
        this.reject(t.seq, str(t.reason));
        return;
      }
      default:
        console.warn(`[match] unknown opcode ${op}`);
    }
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
    const json = JSON.stringify(value, (_k, v) =>
      v instanceof Map ? Object.fromEntries(v) : v,
    );
    console.debug(`[match] ${name}`, json);
  }
}
