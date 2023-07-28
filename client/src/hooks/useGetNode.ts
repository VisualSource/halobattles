import { useSyncExternalStore, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { GroupType } from "server/src/object/Location";
import Runtime from "../lib/runtime";


const subscribe = (callback: () => void) => {
    const instance = Runtime.getInstance();
    instance.addEventListener("node-update", callback);
    return () => {
        instance.removeEventListener("node-update", callback);
    }
}

export const useNodeUnitGroup = (type: GroupType, id: string) => {
    const getSnapshot = useCallback(() => {
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);
        if (!node) return;
        return node.units[type];
    }, [type, id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

const useGetNode = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return;
        const instance = Runtime.getInstance();
        return instance.getNode(id);
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

export default useGetNode;