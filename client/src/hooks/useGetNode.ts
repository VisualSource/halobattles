import { useSyncExternalStore, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { GroupType } from "server/src/object/Location";
import type { UUID } from "server";
import Runtime from "../lib/runtime";
import { user } from "../lib/user";

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

export const useNodeOwnerId = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return null;
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);
        if (!node) return null;
        return node.owner;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

export const useNodeMaxBuildings = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return 0;
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);
        if (!node) return;
        return node.maxBuildingsSlots;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

export const useNodeBuildings = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return [];
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);
        if (!node) return;
        return node.buildings;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

export const useIsNodeOwner = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return false;
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);

        return (node?.owner === user.id) ?? false;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);

    return data;
}

export const useIsNodeSpy = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        if (!id) return false;
        const instance = Runtime.getInstance();
        const node = instance.getNode(id);
        return node?.spies.includes(user.id as UUID) ?? false;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);

    return data;
}

export default useGetNode;