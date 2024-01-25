import type { AppRouter } from "halobattles-server";
import { UnitStackState } from 'halobattles-shared';
import type { TRPCClientError } from "@trpc/client";
import { Tween } from "@tweenjs/tween.js";
import type { Vector3 } from "three";

import { PLANET_BUILDINGS, PLANET_QUEUE_BUILDING, PLANET_QUEUE_UNITS, PLAYER_RESOUCES_KEY } from "./query_keys";
import UnitMovementIndicator from "./game_objects/unit_movement_indicator";
import Engine, { UNKNOWN_STACK_ICON } from "./engine";
import { queryClient } from "./query";
import { client } from '@/lib/trpc';

export default function handle_network(engine: Engine | undefined) {
    const controller = new AbortController();

    if (!engine) return;

    const init = async () => {
        try {
            const self = await client.getSelf.query(undefined, { signal: controller.signal });

            engine.ownerId = self.steamid;

            const map = await client.getMap.query(undefined, { signal: controller.signal });
            engine.loadState(map);

            await client.syncDone.mutate(undefined, { signal: controller.signal });
        } catch (error) {
            if ((error as TRPCClientError<AppRouter>).cause?.name === "ObservableAbortError") return;
            console.error(error);
        }
    }

    init();

    const onSyncDone = client.onSyncDone.subscribe(undefined, {
        onData() {
            console.info("Event: onSyncDone, Payload: never");
            window.dispatchEvent(new CustomEvent("event::loading-state", { detail: false }));
        }
    });

    const onTransfer = client.onTransfer.subscribe(undefined, {
        onData({ path, group, node }) {
            console.info("Event: onTransfer, Payload: ", path, group, node);

            const obj = engine.getObject(node);

            if (engine.ownerId === obj.ownerId) {
                obj.getStack(group).state = UnitStackState.Empty;
            }

            const indicator = new UnitMovementIndicator(path[0].position.x, path[0].position.y);
            engine.addObject(indicator);

            let root: Tween<Vector3>;
            let chain: Tween<Vector3>;

            for (let i = 1; i < path.length; i++) {
                const current = path[i];
                const next = new Tween(indicator.position).to({ x: current.position.x, y: current.position.y }, 1060 * current.duration).onUpdate(() => engine.makeDirty());

                if (i === (path.length - 1)) next.onComplete(() => {
                    indicator.removeFromParent();
                    engine.makeDirty();
                });

                if (i === 1) {
                    root = next;
                    chain = next;
                } else {
                    chain!.chain(next);
                    chain = next;
                }
            }

            root!.start();
        },
    });

    const onUpdatePlanet = client.onUpdatePlanet.subscribe(undefined, {
        onData(value) {
            console.info("Event: onUpdatePlanet, Payload: ", value);

            const planet = engine.getObject(value.id);
            if (!planet) {
                console.error("Failed to find planet with id(%s)", value.id);
                return;
            }

            if (value.ownerId) {
                planet.ownerId = value.ownerId;
            }

            const updateStack = (index: number, group?: { icon: string | null; state: UnitStackState }) => {
                if (!group) return;

                const stack = planet.getStack(index);
                if (planet.ownerId === engine.ownerId || engine.ownerId && value.spies.includes(engine.ownerId)) {
                    stack.icon = group.icon;
                } else {
                    stack.icon = null;
                }

                stack.state = group.state

            }

            for (const [key, data] of Object.entries(value)) {
                if (["id", "spies", "ownerId"].includes(key)) continue;
                switch (key) {
                    case "color":
                        planet.color = data as string;
                        break;
                    case "icon":
                        planet.icon = data as string;
                        break;
                    case "stack_0":
                        updateStack(0, data as keyof typeof value["stack_1"]);
                        break;
                    case "stack_1":
                        updateStack(1, data as keyof typeof value["stack_1"]);
                        break;
                    case "stack_2":
                        updateStack(2, data as keyof typeof value["stack_1"]);
                        break;
                    default:
                        break;
                }
            }
        },
    });

    const onUpdatePlanets = client.onUpdatePlanets.subscribe(undefined, {
        onData(data) {
            console.info("Event: onUpdatePlanets, Payload: ", data);

            for (const planet of data) {
                const item = engine.getObject(planet.id);

                for (const [key, value] of Object.entries(planet)) {
                    if (["id", "ownerId", "spies"].includes(key) || !value) continue;

                    if (key.startsWith("stack_")) {
                        if (item.ownerId !== engine.ownerId) {
                            (value as { icon: string | null }).icon = UNKNOWN_STACK_ICON;
                        }
                        item.setStack(+key.replace("stack_", ""), value as { state: UnitStackState, icon: string | null });
                    }

                }

            }
        },
    });

    const onUpdateQueue = client.onQueueUpdate.subscribe(undefined, {
        onData(value) {
            queryClient.invalidateQueries({ queryKey: [value.type === "unit" ? PLANET_QUEUE_UNITS : PLANET_QUEUE_BUILDING, value.node] });
        },
    });

    const onUpdateResources = client.onUpdateResouces.subscribe(undefined, {
        onData() {
            queryClient.invalidateQueries({ queryKey: [PLAYER_RESOUCES_KEY] })
        }
    });

    const onUpdateBuildings = client.onUpdateBuildings.subscribe(undefined, {
        onData(value) {
            queryClient.invalidateQueries({
                queryKey: [PLANET_BUILDINGS, value]
            });
        },
    });

    return () => {
        controller.abort();
        onTransfer.unsubscribe();
        onSyncDone.unsubscribe();
        onUpdateQueue.unsubscribe();
        onUpdatePlanet.unsubscribe();
        onUpdatePlanets.unsubscribe();
        onUpdateResources.unsubscribe();
        onUpdateBuildings.unsubscribe();
    }
}