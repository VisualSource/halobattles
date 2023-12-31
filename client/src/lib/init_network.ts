import type { TRPCClientError } from "@trpc/client";
import { Tween } from "@tweenjs/tween.js";
import type { Vector3 } from "three";

import UnitMovementIndicator from "./game_objects/unit_movement_indicator";
import { UnitStackState } from "./game_objects/unit_stack";
import type { AppRouter } from "../../../server/src";
import { client } from '@/lib/trpc';
import Engine from "./engine";

const handleError = (e: unknown) => {
    if ((e as TRPCClientError<AppRouter>).cause?.name === "ObservableAbortError") console.error(e);
}

export default function handle_network(engine: Engine | undefined) {
    const controller = new AbortController();

    if (!engine) return;

    client.getMap.query(undefined, { signal: controller.signal }).then(value => {
        engine.loadState(value);
    }).catch(handleError);

    const onTransfer = client.onTransfer.subscribe(undefined, {
        onData({ path, group, node }) {
            engine.getObject(node).getStack(group).setState(UnitStackState.Empty);

            const indicator = new UnitMovementIndicator(path[0].position.x, path[0].position.y);
            engine.addObject(indicator);

            let root: Tween<Vector3>;
            let chain: Tween<Vector3>;

            for (let i = 1; i < path.length; i++) {
                const current = path[i];
                const next = new Tween(indicator.position).to({ x: current.position.x, y: current.position.y }, 1000 * current.duration).onUpdate(() => engine.makeDirty());

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
    const onMoveGroup = client.onMoveGroup.subscribe(undefined, {
        onData(value) {
            engine.getObject(value.uuid).getStack(value.group).setState(value.state as UnitStackState);
        },
    });

    return () => {
        controller.abort();
        onTransfer.unsubscribe();
        onMoveGroup.unsubscribe();
    }
}