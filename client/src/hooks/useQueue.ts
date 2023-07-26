import { useSyncExternalStore } from "react";
import QueueEngine from "../lib/QueueEngine";

const subscribe = (callback: () => void) => {
    const engine = QueueEngine.get();
    engine.addEventListener("queue-update", callback);
    return () => {
        engine.removeEventListener("queue-update", callback);
    }
}

const getSnapshot = (nodeId: string, queueId: string) => {
    const engine = QueueEngine.get();
    return engine.getQueue(nodeId, queueId);
}

const getItemSnapshot = (nodeId: string, queueId: string) => {
    const engine = QueueEngine.get();
    return engine.getActiveItem(nodeId, queueId);
}

export const useActiveQueueItem = (nodeId: string, queueId: string) => {
    const queue = useSyncExternalStore(subscribe, () => getItemSnapshot(nodeId, queueId));
    return queue;
}

const useQueue = (nodeId: string, queueId: string) => {
    const queue = useSyncExternalStore(subscribe, () => getSnapshot(nodeId, queueId));
    return queue;
}
export default useQueue; 