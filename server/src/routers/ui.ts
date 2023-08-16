import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { t } from "../trpc.js";
import type { UUID } from '../lib.js';
import type { Factions } from '../object/GameState.js';
import { TRPCError } from '@trpc/server';
import GameState from '../object/GameState.js';

type LobbyPlayer = { isHost: boolean, uuid: UUID; username: string; faction: Factions | "unknown" };
type LobbyEvent = { type: "kick-event", uuid: UUID; } | { type: "start-event" } | { type: "players-not-ready" };

export class Lobby extends EventEmitter {
    static INSTACE: Lobby | null = null;

    static get(): Lobby {
        if (!Lobby.INSTACE) Lobby.INSTACE = new Lobby();
        return Lobby.INSTACE;
    }

    public settings = {
        map: "test_map"
    }
    public players: Map<UUID, LobbyPlayer> = new Map();
    public getUser(user: string | null): LobbyPlayer {
        if (!user) throw new TRPCError({ message: "No user is set", code: "UNPROCESSABLE_CONTENT" });
        const userData = this.players.get(user as UUID);
        if (!userData) throw new TRPCError({ message: "Failed to find user data", code: "NOT_FOUND" });
        return userData;
    }
    public getPlayerList(): LobbyPlayer[] {
        return Array.from(this.players.values());
    }
    public addPlayer(uuid: string | null, username: string) {
        if (!uuid) throw new TRPCError({ message: "No user id is set", code: "UNPROCESSABLE_CONTENT" });
        if (this.players.has(uuid as UUID)) throw new TRPCError({ message: "User already exists", code: "CONFLICT" });

        const isHost = this.players.size === 0;

        this.players.set(uuid as UUID, {
            uuid: uuid as UUID,
            username,
            faction: "unknown",
            isHost
        });

        this.emit("update-player-list");

        return isHost;
    }
    public updateSettings(settings: { map: string; }, userId: string | null) {
        if (!this.isUserHost(userId)) throw new TRPCError({ message: "User is not host", code: "UNAUTHORIZED" });

        this.settings = settings;

        this.emit("msg", {
            msg: `Host changed map to ${settings.map}`,
            id: "system-us-east-1",
            username: "System"
        });
    }
    public kickPlayer(owner: string | null, userId: string | null) {
        if (!this.isUserHost(owner)) throw new TRPCError({ message: "User is not host", code: "UNAUTHORIZED" });
        if (!this.players.has(userId as UUID)) throw new TRPCError({ message: "Can't kick user do to not existing", code: "NOT_FOUND" });

        this.players.delete(userId as UUID);

        this.emit("lobby-event", { type: "kick-event", uuid: userId } as LobbyEvent);
        this.emit("update-player-list");

    }
    public isUserHost(userId: string | null): boolean {
        const user = this.getUser(userId);
        return user.isHost;
    }
    public updateUserProp<T extends keyof LobbyPlayer>(userId: string | null, prop: T, value: LobbyPlayer[T], updateMsg: string) {
        const user = this.getUser(userId);

        const oldValue = user[prop];
        user[prop] = value;

        this.emit("msg", {
            msg: updateMsg.replace("${NEW_VALUE}", value.toString()).replace("${OLD_VALUE}", oldValue.toString()).replace("${USERNAME}", user.username),
            id: "system-us-east-1",
            username: "System"
        });
        this.emit("update-player-list");
    }
    public sendMsg(msg: string, userId: string | null) {
        const user = this.getUser(userId);
        this.emit("msg", { msg, id: user.uuid, username: user.username });
    }
}

const lobby = Lobby.get();

export const uiRouter = t.router({
    joinLobby: t.procedure.input(z.object({ username: z.string().min(3).max(20) })).mutation(({ input, ctx }) => {
        return lobby.addPlayer(ctx.user, input.username);
    }),
    getPlayerList: t.procedure.query(() => {
        return lobby.getPlayerList();
    }),
    startGame: t.procedure.mutation(({ ctx }) => {
        if (!lobby.isUserHost(ctx.user)) throw new TRPCError({ message: "You are not host", code: "UNAUTHORIZED" });

        const list = lobby.getPlayerList();

        if (list.some(value => value.faction === "unknown")) {
            throw new TRPCError({ message: "One or more player has not selected a faction", code: "CONFLICT" });
        }

        GameState.get().initGame(list as {
            isHost: boolean;
            uuid: UUID;
            username: string;
            faction: Factions;
        }[], lobby.settings);

        lobby.emit("lobby-event", { type: "start-event" } as LobbyEvent);
    }),
    getMaps: t.procedure.query(() => {
        return ["test_map"];
    }),
    setGameSettings: t.procedure.input(z.object({ map: z.string() })).mutation(({ input, ctx }) => {
        lobby.updateSettings(input, ctx.user);
    }),
    setUsername: t.procedure.input(z.string().min(3).max(20)).mutation(({ input, ctx }) => {
        lobby.updateUserProp(ctx.user, "username", input, "${OLD_VALUE} changed username to ${NEW_VALUE}");
    }),
    setFaction: t.procedure.input(z.enum(["UNSC", "Banished", "Covenant", "Forerunner"])).mutation(({ input, ctx }) => {
        lobby.updateUserProp(ctx.user, "faction", input, "${USERNAME} changed faction to ${NEW_VALUE}");
    }),
    kickPlayer: t.procedure.input(z.string().uuid()).mutation(({ input, ctx }) => {
        lobby.kickPlayer(ctx.user, input);
    }),
    sendMsg: t.procedure.input(z.string().min(1).max(255)).mutation(({ input, ctx }) => {
        lobby.sendMsg(input, ctx.user);
    }),
    onPlayerListUpdate: t.procedure.subscription(() => {
        return observable<void>((emit) => {
            const onUpdate = () => emit.next();
            lobby.on("update-player-list", onUpdate);
            return () => lobby.off("update-player-list", onUpdate);
        });
    }),
    onLobbyEvent: t.procedure.subscription(() => {
        return observable<LobbyEvent>(emit => {
            const onEvent = (data: LobbyEvent) => emit.next(data);
            lobby.on("lobby-event", onEvent);
            return () => {
                lobby.off("lobby-event", onEvent);
            }
        });
    }),
    onMsg: t.procedure.subscription(() => {
        return observable<{ msg: string; username: string; id: UUID; }>((emit) => {
            const onMsg = (data: { msg: string; username: string; id: UUID }) => emit.next(data);
            lobby.on("msg", onMsg);
            return () => {
                lobby.off("msg", onMsg);
            }
        });
    })
});