import { useCallback, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import Runtime from "../lib/runtime";

const subscribe = (callback: () => void) => {
    const instance = Runtime.getInstance();
    instance.addEventListener("node-update", callback);
    return () => {
        instance.removeEventListener("node-update", callback);
    }
}

const useGetNode = () => {
    const { id } = useParams();
    const getSnapshot = useCallback(() => {
        const instance = Runtime.getInstance();
        if (!id) return;
        const node = instance.getNode(id);
        return node;
    }, [id]);
    const data = useSyncExternalStore(subscribe, getSnapshot);
    return data;
}

export default useGetNode;