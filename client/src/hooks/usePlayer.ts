import { useSyncExternalStore } from "react";
import Runtime from "../lib/runtime";

const subscribe = (callback: () => void) => {
    const engine = Runtime.getInstance();
    engine.addEventListener("player-update", callback);
    return () => {
        engine.removeEventListener("player-update", callback);
    }
}

const getUnitCapSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player.unitcap;
}

const getCreditsSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player.creds;
}

export const usePlayerUnitCap = () => {
    const data = useSyncExternalStore(subscribe, getUnitCapSnapshot)
    return data;
}
export const usePlayerCredits = () => {
    const data = useSyncExternalStore(subscribe, getCreditsSnapshot);
    return data;
}