import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { LocalStore } from "./local";

/** The current Match Time, re-rendering once a second for countdowns. */
export function useMatchNow(local: LocalStore) {
  const offset = useStore(local, (s) => s.clockOffset);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now + offset;
}

/** "45 s", "3 min": how long ago something was seen. */
export function formatAge(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
}
