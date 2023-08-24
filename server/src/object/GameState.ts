import { randomUUID, randomBytes } from 'node:crypto';
import { Worker } from "node:worker_threads";
import { EventEmitter } from 'node:events';
import { readFileSync } from "node:fs";
import { resolve } from 'node:path';
import remove from 'lodash.remove';
import { GameEvents, MoveRequest, MoveResponse, UpdateLocationResponse } from '../object/Events.js';
import type { Unit, GroupType, Building, LocationProps } from './Location.js';
import { BuildingStat, buildOptions } from '../map/upgradeList.js';
import factionsBuildable, { factionColors, factionStart } from "../map/faction_builds.js";
import type { BattleResult } from "./BattleRuntime.js";
import { __dirname } from "../lib/utils.js";
import type { UUID } from "../lib.js";
import Location from './Location.js';
import units from '../map/units.js';
import Dijkstra from '../lib/dijkstra.js';

export type UnitTransfer = {
    expectedResolveTime: Date,
    owner: UUID;
    id: UUID;
    units: Unit[];
    jumps: number;
    origin: {
        id: UUID;
        group: GroupType
    }
    dest: {
        id: UUID;
        group: GroupType
    }
}

export type Factions = "UNSC" | "Banished" | "Covenant" | "Forerunner";
type GlobalType = `unit-${number}` | `building-${number}`;
export type Player = {
    isHost: boolean;
    color: number;
    name: string;
    factions: Factions;
    id: UUID,
    cap: {
        current: number;
        max: number;
        restrictions: { [key in GlobalType]: number }
    }
    credits: {
        current: number;
        income: number;
    }
}

export default class GameState extends EventEmitter {
    static INSTANCE: GameState | null = null;
    static get(): GameState {
        if (!GameState.INSTANCE) {
            GameState.INSTANCE = new GameState();
        }
        return GameState.INSTANCE;
    }

    private transfers: Map<UUID, UnitTransfer> = new Map();
    private map: Location[] = [];
    private spyExp: { owner: UUID; nodeId: UUID; exp: Date }[] = [];
    public players: Player[] = [
        /*{
            isHost: false,
            credits: {
                current: 10_000,
                income: 1_000
            },
            cap: {
                max: 100,
                current: 2,
                restrictions: {}
            },
            color: factionColors["Covenant"],
            name: "SomeOtherUser",
            factions: "Covenant",
            id: "73806576-0e72-4675-b0d8-b0296f026d2b",
        },
        {
            isHost: true,
            credits: {
                current: 20_000,
                income: 1_000
            },
            cap: {
                max: 100,
                current: 8,
                restrictions: {}
            },
            color: factionColors["Banished"],
            name: "VisualSource",
            factions: "Banished",
            id: "1724ea86-18a1-465c-b91a-fce23e916aae",
        }*/
    ];
    public deadPlayers: Set<UUID> = new Set();
    private interval: NodeJS.Timer;

    constructor() {
        super();
        this.addListener(GameEvents.ObjectiveLose, (ev) => {

            this.deadPlayers.add(ev.owner);
            if (this.deadPlayers.size === (this.players.length - 1)) {

                const winner = this.players.filter(value => !this.deadPlayers.has(value.id)).at(0);

                this.emit(GameEvents.GameOver, {
                    winner: winner?.name ?? "Every ones dead",
                    id: winner?.id
                });

                clearInterval(this.interval);
            }
        });
    }

    private loadMap(map: string): void {
        const mapFile = readFileSync(resolve(__dirname, `../../maps/${map}.json`), { encoding: "utf-8" });

        const rawNodes = JSON.parse(mapFile) as LocationProps[];

        const nodes = [];

        for (const node of rawNodes) {
            nodes.push(new Location(node))
        }

        this.map = nodes;
    }

    public initGame(players: { faction: Factions, uuid: UUID; username: string; isHost: boolean }[], settings: { map: string; }) {
        this.loadMap(settings.map);

        for (const player of players) {
            this.players.push({
                id: player.uuid,
                name: player.username,
                isHost: player.isHost,
                color: factionColors[player.faction],
                factions: player.faction,
                credits: {
                    current: 5000,
                    income: 100
                },
                cap: {
                    max: 10,
                    current: 0,
                    restrictions: {}
                }
            });

            const start = this.map.find(value => value.name === factionStart[player.faction]);
            if (start) {
                start?.setOwner(player.uuid, factionColors[player.faction]);
                this.addBuilding(1, start.objectId);
            }
        }

        this.interval = setInterval(() => {
            for (const player of this.players) {
                player.credits.current += player.credits.income;
                this.emit(GameEvents.UpdatePlayer, player);
            }
            const time = new Date();

            const old = remove(this.spyExp, (n) => n.exp <= time);
            for (const item of old) {
                const node = this.getNode(item.nodeId);
                if (!node) continue;
                node.spies = node.spies.filter(value => value !== item.nodeId);

                this.emit(GameEvents.UpdateLocation, {
                    type: "set-spies",
                    payload: {
                        node: item.nodeId,
                        spies: node.spies
                    }
                } as UpdateLocationResponse);
            }
        }, 40_000);
    }

    public resetGame() {
        this.players = [];
        this.map = [];
        this.transfers = new Map();
        this.spyExp = [];
        this.deadPlayers = new Set();
        clearInterval(this.interval);
    }
    public generatePath(request: MoveRequest, user: UUID, transferId?: UUID): void {
        const path = Dijkstra(this.map, request.from.id, request.to.id, user);

        const transfer = transferId ?? this.createTransfer(user, request, Math.round(path.length / 2));

        this.emit(GameEvents.TransferUnits, {
            owner: user,
            path,
            transferId: transfer
        } satisfies MoveResponse);
    }
    public startBattle(nodeId: UUID, transferId: UUID) {
        console.log("[BATTLE] START")
        this.emit(GameEvents.UpdateLocation, {
            type: "set-contested-state",
            payload: {
                node: nodeId,
                state: true
            }
        } as UpdateLocationResponse);

        const node = this.getNode(nodeId);

        node.contested = true;

        const transfer = this.getTransfer(transferId);

        if (node.owner) this.notify(`${node.name} is under attack!`, "warn", node.owner);

        console.log(node, transfer);

        const worker = new Worker(resolve(__dirname, "../object/BattleRuntime.js"), {
            workerData: {
                node,
                transfer,
            },
            name: `[Worker] Battle for ${nodeId}`
        });

        worker.on("message", (ev: BattleResult | { type: "message", msg: unknown[] }) => {
            if ("type" in ev) {
                console.log(...ev.msg);
                return;
            }
            console.log("[BATTLE RESULTS]", JSON.stringify(ev, undefined, 2));
            const defender = this.getPlayer(ev.defender.id);
            const attacker = this.getPlayer(ev.attacker.id);
            if (!attacker || !defender) throw new Error("Unable to get player");

            attacker.cap.current -= ev.attacker.lostCap;
            defender.cap.current -= ev.defender.lostCap;

            const node = this.getNode(ev.node);
            const transfer = this.getTransfer(ev.attackerTransferId);

            for (const unit of ev.attacker.lostUnits) {
                if (unit.type === "building") continue;
                const item = transfer.units.findIndex(value => value.id === unit.id);
                if (item === -1) continue;
                transfer.units[item].count -= unit.lost;
            }

            remove(transfer.units, value => value.count <= 0);

            for (const unit of ev.defender.lostUnits) {
                if (unit.type === "building") {
                    console.log("REMOVE BUILDING", unit)
                    if (unit.instId) {
                        const building = node.removeBuilding(unit.instId);
                        if (!building) continue;
                        this.deallocBuildings(building, defender.id);
                        //remove building
                    }
                    continue;
                }
                node.removeUnitFromAny({ icon: "", count: unit.lost, id: unit.id, idx: 0 });
            }

            remove(this.spyExp, value => value.nodeId === node.objectId);

            if (ev.winner === "attacker") {
                console.log("[BATTLE CLEANUP - ATTACKER] START");
                this.deallocBuildings(node.buildings, defender.id);
                node.resetNode();
                node.setOwner(attacker.id, attacker.color);
                console.log("[BATTLE CLEANUP] UPDATE LOCATION SET-OWNER");
                this.emit(GameEvents.UpdateLocation, {
                    type: "set-owner",
                    owner: attacker.id,
                    payload: {
                        node: ev.node,
                        color: attacker.color,
                    }
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP] UPDATE LOCATION UPDATE UNITS GROUPS");
                this.emit(GameEvents.UpdateLocation, {
                    type: "update-units-groups",
                    owner: attacker.id,
                    payload: [
                        { group: "left", units: transfer.units, node: node.objectId },
                        { group: "center", units: [], node: node.objectId },
                        { group: "right", units: [], node: node.objectId }
                    ]
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP] UPDATE LOCATION UPDATE SET SPIES");
                this.emit(GameEvents.UpdateLocation, {
                    type: "set-spies",
                    owner: attacker.id,
                    payload: {
                        node: node.objectId,
                        spies: [] as UUID[]
                    }
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP] UPDATE LOCATION UPDATE UPDATE BUILDINGS");
                this.emit(GameEvents.UpdateLocation, {
                    type: "update-buildings",
                    owner: attacker.id,
                    payload: {
                        buildings: [],
                        node: node.objectId
                    }
                } as UpdateLocationResponse);
                this.notify(`We have won the battle for ${node.name}`, "info", attacker.id);
                this.notify(`We have lost the battle for ${node.name}`, "info", defender.id);

                this.transfers.delete(transfer.id);
            } else {
                console.log("[BATTLE CLEANUP - DEFENDER] START");
                console.log("[BATTLE CLEANUP - DEFENDER] UPDATE LOCATION UPDATE UNITS GROUPS");
                this.emit(GameEvents.UpdateLocation, {
                    type: "update-units-groups",
                    owner: defender.id,
                    payload: [
                        { group: "left", units: node.units.left, node: node.objectId },
                        { group: "center", units: node.units.center, node: node.objectId },
                        { group: "right", units: node.units.right, node: node.objectId }
                    ]
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP - DEFENDER] UPDATE LOCATION UPDATE BUILDINGS");
                this.emit(GameEvents.UpdateLocation, {
                    type: "update-buildings",
                    owner: defender.id,
                    payload: {
                        buildings: node.buildings,
                        node: node.objectId
                    }
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP - DEFENDER] UPDATE LOCATION SET SPIES");
                this.emit(GameEvents.UpdateLocation, {
                    type: "set-spies",
                    owner: defender.id,
                    payload: {
                        node: node.objectId,
                        spies: [] as UUID[]
                    }
                } as UpdateLocationResponse);
                console.log("[BATTLE CLEANUP - DEFENDER] NOTIFY");
                this.notify(`We have lost the battle for ${node.name}`, "info", attacker.id);
                this.notify(`We have destoryed the enemy at ${node.name}`, "info", defender.id);

                if (transfer.units.length >= 1) {
                    // return to sender
                    console.log("[BATTLE CLEANUP] Return to sender");
                    this.returnTransferToSender(transfer.id);
                } else {
                    console.log("[BATTLE CLEANUP - DEFENDER] DELETE TRANSFER");
                    this.transfers.delete(transfer.id);
                }
            }

            console.log("[BATTLE CLEANUP] UPDATE PLAYERS");
            this.emit(GameEvents.UpdatePlayer, defender);
            this.emit(GameEvents.UpdatePlayer, attacker);
            console.log("[BATTLE CLEANUP] SET CONTESTED STATE");

            node.contested = false;
            this.emit(GameEvents.UpdateLocation, {
                type: "set-contested-state",
                payload: {
                    node: ev.node,
                    state: false
                }
            } as UpdateLocationResponse);
        });
        worker.on("error", (ev) => {
            console.error(ev);
            throw new Error("Battle Error", { cause: "UNKNOWN_WORKER_ERROR" });
        });
        worker.on("exit", (code) => {
            console.log("Battle Exited With code:", code);
        });
        worker.on("messageerror", (ev) => {
            console.log(ev);
            throw new Error("Failed to parse message", { cause: "WORKER_MESSAGE_ERROR" });
        });
    }
    public createTransfer(owner: UUID, data: MoveRequest, jumps: number): UUID {

        const originNode = this.getNode(data.from.id);

        // calc time to transfer units.
        const timeToTransferInSec = jumps * 10;

        const time = new Date();
        time.setSeconds(time.getSeconds() + timeToTransferInSec);

        const request: UnitTransfer = {
            expectedResolveTime: time,
            id: randomUUID(),
            owner,
            jumps,
            origin: data.from,
            dest: data.to,
            units: originNode.getUnitFromGroup(data.from.group)
        }

        originNode.clearGroup(data.from.group);
        this.emit(GameEvents.UpdateLocation, {
            type: "update-units-groups",
            owner,
            payload: [{
                node: originNode.objectId,
                group: data.from.group,
                units: []
            }]
        } as UpdateLocationResponse);

        this.transfers.set(request.id, request);

        return request.id;
    }
    public finishTransfer(transferOwnerId: UUID, transferId: UUID): void {
        const time = new Date();
        const transfer = this.getTransfer(transferId);
        if (transfer.owner !== transferOwnerId) throw new Error("Executer uuid does not match transfer owner uuid.", { cause: "OWNER_UUID_MISSMATCH" });

        const expectedItem = transfer.expectedResolveTime.getSeconds();
        const currentTime = time.getSeconds();
        if (!(((currentTime - 5) < expectedItem) || ((currentTime + 5) > expectedItem))) {
            throw new Error("Transfer did not happen with allowed time frame", { cause: "EXPIRED_TIME_FRAME" });
        }
        const node = this.getNode(transfer.dest.id);

        if (node.contested) {
            console.log("NODE IS CONTESTED RETURNING HOME");
            this.returnTransferToSender(transferId);
            return;
        }

        /** 
         * Handle the capture of nodes that are unowned or a node where it has no defences, 
         * so starting a battle would be pointless.
        */
        if (node.owner === null || (node.owner !== transfer.owner && node.isEmpty() && !node.hasDefence())) {
            console.log("TRANSFER FINAL OPTION 1");
            const player = this.getPlayer(transferOwnerId);

            this.emit(GameEvents.UpdateLocation, {
                type: "set-owner",
                owner: transferOwnerId,
                payload: {
                    node: node.objectId,
                    color: player.color,
                }
            } as UpdateLocationResponse);

            node.appendUnits(transfer.dest.group, transfer.units);

            this.emit(GameEvents.UpdateLocation, {
                owner: transfer.owner,
                type: "update-units-groups",
                payload: [{
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }]
            } as UpdateLocationResponse);

            this.transfers.delete(transferId);
            return;
        }

        /** 
         * Handle a player moving units between two nodes that they own.
        */
        if (node.owner === transfer.owner) {
            console.log("TRANSFER FINAL OPTION 2");
            node.appendUnits(transfer.dest.group, transfer.units);
            this.emit(GameEvents.UpdateLocation, {
                owner: transfer.owner,
                type: "update-units-groups",
                payload: [{
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }]
            } as UpdateLocationResponse);

            this.transfers.delete(transferId);
            return;
        }

        /** 
         * Handle when a player move a single spy unit to a enemy node.
         *  
         * A spy should be a single unit and have the scout tag.
        */
        if (transfer.units.length === 1 && transfer.units[0].count === 1) {
            console.log("TRANSFER OPTION 3 CHECK");
            const unit = units.get(transfer.units[0].id);
            if (!unit) throw new Error("Failed to get unit data");

            if (unit.stats.isScout) {
                console.log("TRANSFER OPTION 3");
                this.notify(`Scouting has started on ${node.name}`, "info", transfer.owner);
                const nodeData = this.getNode(transfer.dest.id);

                // player already has a spy on this node
                if (nodeData.spies.includes(transfer.owner as UUID)) {
                    this.deallocUnits(transfer.units, transfer.owner);
                    this.transfers.delete(transfer.id);
                    return;
                }

                nodeData.spies.push(transfer.owner as UUID);

                const time = new Date();
                time.setSeconds(120);

                this.spyExp.push({
                    owner: transfer.owner as UUID,
                    nodeId: transfer.dest.id,
                    exp: time
                });
                this.deallocUnits(transfer.units, transfer.owner as UUID);
                this.emit(GameEvents.UpdateLocation, {
                    type: "set-spies",
                    payload: {
                        node: transfer.dest.id,
                        spies: nodeData.spies
                    }
                } as UpdateLocationResponse);


                this.transfers.delete(transfer.id);
                return;
            }
        }

        console.log("TRANSFER FINAL OPTION 4");
        this.startBattle(node.objectId, transferId);
    }
    public getTransfer(uuid: UUID) {
        const transfer = this.transfers.get(uuid);
        if (!transfer) throw new Error("Failed to find transfer with given uuid", { cause: "TRANSFER_NOT_FOUND" });
        return transfer;
    }
    public addStat(stat: BuildingStat, player: Player) {
        switch (stat.stat) {
            case "cap.current": {
                player.cap.current += stat.value;
                break;
            }
            case "credits.income":
                player.credits.income += stat.value;
                break;
            case "cap.max": {
                player.cap.max += stat.value;
                break;
            }
            case "event": {
                if (stat.run !== "create") break;
                this.emit(stat.event, { owner: player.id });
            }
            case "nostat":
                break;
            default:
                break;
        }
    }
    public removeStat(stat: BuildingStat, player: Player) {
        switch (stat.stat) {
            case "cap.current": {
                player.cap.current -= stat.value;
                break;
            }
            case "credits.income":
                player.credits.income -= stat.value;
                break;
            case "cap.max": {
                player.cap.max -= stat.value;
                break;
            }
            case "event": {
                if (stat.run !== "destory") break;
                this.emit(stat.event, { owner: player.id });
            }
            case "nostat":
                break;
            default:
                break;
        }
    }
    public addBuilding(id: number, nodeId: UUID) {
        const node = this.getNode(nodeId);
        if (!node) throw new Error("Failed to get node");

        const item = buildOptions.get(id);
        if (!item) throw new Error("Failed to get building/tech");

        const building = {
            level: 1,
            id: item.id,
            icon: item.icon,
            objId: randomBytes(5).toString("hex")
        };

        node.addBuilding(building);
        if (node.owner) this.allocBuildings([building], node.owner);
    }
    public allocBuildings(buildings: Building[], owner: UUID): void {
        const player = this.getPlayer(owner);
        if (!player) throw new Error("Failed to get player");
        for (const building of buildings) {
            // remove buildings from defender
            const item = buildOptions.get(building.id);
            if (!item) continue;

            for (const stat of item.levels[building.level].values) {
                this.addStat(stat, player);
            }
        }

    }
    public deallocBuildings(buildings: Building[], owner: UUID): void {
        const player = this.getPlayer(owner);
        if (!player) throw new Error("Failed to get player");
        for (const building of buildings) {
            // remove buildings from defender
            const item = buildOptions.get(building.id);
            if (!item) continue;
            for (let i = 1; i <= building.level; i++) {
                for (const stat of item.levels[i].values) {
                    this.removeStat(stat, player);
                }
            }
        }
    }
    public deallocUnits(items: Unit[], owner: UUID) {
        const player = this.getPlayer(owner);
        if (!player) throw new Error("Failed to get player");

        for (const item of items) {
            const unit = units.get(item.id);
            if (!unit) continue;

            player.cap.current -= (unit.capSize * item.count);

            if (unit.globalMax !== -1 && player.cap.restrictions[`unit-${unit.id}`]) {
                player.cap.restrictions[`unit-${unit.id}`] -= item.count;
            }
        }

        this.emit(GameEvents.UpdatePlayer, player);
    }
    /**
     * Return a transfer to it origin
     */
    public returnTransferToSender(id: UUID): void {
        const transfer = this.getTransfer(id);

        const timeToTransferInSec = transfer.jumps * 10;
        const time = new Date();
        time.setSeconds(time.getSeconds() + timeToTransferInSec);

        transfer.expectedResolveTime = time;

        const oldOrgin = transfer.origin;
        transfer.origin = transfer.dest
        transfer.dest = oldOrgin;

        this.generatePath({
            from: transfer.origin,
            to: transfer.dest
        }, transfer.owner, transfer.id);
    }

    public getSelectedMap() {
        return this.map;
    }
    public getPlayer(id: UUID | null) {
        if (!id) throw new Error("User uuid is null", { cause: "NULL_USER_UUID" })
        const player = this.players.find(value => value.id === id);
        if (!player) throw new Error("Failed to find player", { cause: "PLAYER_NOT_FOUND" });
        return player;
    }
    public getNode(nodeId: UUID) {
        const node = this.map.find(value => value.objectId === nodeId);
        if (!node) throw new Error("Failed to find node with given uuid.", { cause: "NODE_NOT_FOUND" });
        return node;
    }
    public getNodeBuildOptions(nodeId: UUID, owner: UUID) {
        const node = this.getNode(nodeId);
        const player = this.getPlayer(owner);
        if (!node || !player) throw new Error("Failed to obtan required data.", { cause: "MISSING_NODE_OR_PLAYER_DATA" });
        if (node.owner !== owner) throw new Error("Current user can not query data for this node", { cause: "NODE_OWNER_NOT_MATCH_REQUEST_USER" });

        const allowedUpgrades = factionsBuildable[player.factions].buildings.filter(value => !node.buildOptions.buildings.not_allowed.includes(value));

        const options = [];
        for (const item of allowedUpgrades) {
            const data = buildOptions.get(item);
            if (!data) continue;

            const allowed = data.requires.every(requiement => {
                if (requiement.type === "local") {
                    return node.buildOptions.buildings.current.includes(requiement.id);
                }
                return player.cap.restrictions[`building-${requiement.id}`] >= 1;
            });
            if (!allowed) continue;

            options.push(data);
        }

        return options;
    }
    public getNodeUnitOptions(nodeId: UUID, owner: UUID) {
        const node = this.getNode(nodeId);
        const player = this.getPlayer(owner);
        if (!node || !player) throw new Error("Failed to obtan required data.", { cause: "MISSING_NODE_OR_PLAYER_DATA" });
        if (node.owner !== owner) throw new Error("Current user can not query data for this node", { cause: "NODE_OWNER_NOT_MATCH_REQUEST_USER" });

        const allowedUpgrades = factionsBuildable[player.factions].units.filter(value => !node.buildOptions.units.not_allowed.includes(value));

        const options = [];
        for (const item of allowedUpgrades) {
            const data = units.get(item);
            if (!data) continue;

            const allowed = data.requires.every(requirement => {
                if (requirement.type === "local") {
                    return node.buildOptions.buildings.current.includes(requirement.id);
                }
                return player.cap.restrictions[`building-${requirement.id}`] >= 1;
            });

            if (!allowed) continue;

            options.push(data);
        }

        return options;
    }
    public notify(msg: string, type: "warn" | "info" | "error" = "info", to: UUID | "all" = "all"): void {
        this.emit(GameEvents.Notify, { to, type, msg });
    }
}