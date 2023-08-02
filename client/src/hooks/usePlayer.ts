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
    return engine.player?.income;
}

const getUnitCapSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player?.unitcap;
}

const getCreditsSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player?.creds;
}

const getPlayerDataSnapshot = () => {
    const engine = Runtime.getInstance();
    return engine.player;
}

export const usePlayerIncome = () => {
    const data = useSyncExternalStore(subscribe, getIncomeSnapshot);
    return data;
}
export const usePlayerUnitCap = () => {
    const data = useSyncExternalStore(subscribe, getUnitCapSnapshot)
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