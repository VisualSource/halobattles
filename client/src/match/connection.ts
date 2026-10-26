import type { MatchData, Session, Socket } from "@heroiclabs/nakama-js";
import { ByteBuffer } from "flatbuffers";
import { LobbyState, type LobbyStateT, Op, Phase } from "../gen/wire";
import { createMatchStore, type Lobby } from "./store";

export type SocketLike = Pick<
  Socket,
  "connect" | "joinMatch" | "leaveMatch" | "disconnect"
> & { onmatchdata: (m: MatchData) => void };

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
 * at the edge and writes the Match store.
 */
export class MatchConnection {
  readonly store = createMatchStore();
  private matchId = "";
  private readonly log: boolean;

  constructor(
    private readonly socket: SocketLike,
    opts: { log?: boolean } = {},
  ) {
    this.log = opts.log ?? import.meta.env.DEV;
  }

  async open(session: Session, matchId: string) {
    this.socket.onmatchdata = (m) => this.receive(m.op_code, m.data);
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

  private receive(op: number, data: Uint8Array) {
    const bb = new ByteBuffer(data);
    switch (op) {
      case Op.LobbyState: {
        const lobby = toLobby(LobbyState.getRootAsLobbyState(bb).unpack());
        this.debug("LobbyState", lobby);
        this.store.setState({ lobby });
        return;
      }
      default:
        console.warn(`[match] unknown opcode ${op}`);
    }
  }

  private debug(name: string, value: unknown) {
    if (!this.log) return;
    const json = JSON.stringify(value, (_k, v) =>
      v instanceof Map ? Object.fromEntries(v) : v,
    );
    console.debug(`[match] ${name}`, json);
  }
}
