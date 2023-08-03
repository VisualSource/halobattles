import { useSyncExternalStore } from "react";
import Runtime from "../lib/runtime";

const subscribe = (callback: () => void) => {
    const engine = Runtime.getInstance();
    engine.addEventListener("player-update", callback);
    return () => {
        engine.removeEventListener("player-update", callback);
    }
}

const getIncomeSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player?.credits?.income;
}

const getUnitCapSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player?.cap;
}

const getCreditsSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player?.credits.current;
}

const getPlayerDataSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player;
}

export const usePlayerIncome = () => {
    const data = useSyncExternalStore(subscribe, getIncomeSnapshot);
    return data;
}
export const usePlayerCap = () => {
    const data = useSyncExternalStore(subscribe, getUnitCapSnapshot);
    return data;
}
export const usePlayerCredits = () => {
    const data = useSyncExternalStore(subscribe, getCreditsSnapshot);
    return data;
}
export const usePlayerData = () => {
    const data = useSyncExternalStore(subscribe, getPlayerDataSnapshot);
    return data;
}