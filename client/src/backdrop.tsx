import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { RingScene } from "./scene/ring";

// Screens ask for the Halo ring backdrop by calling useRingBackdrop. The root
// layout keeps one scene alive while any screen wants it, so moving between
// those screens doesn't restart the flight.
const useBackdrop = create<{ ring: number; noHeader: number }>(() => ({
  ring: 0,
  noHeader: 0,
}));

/** Shows the ring behind this screen; `header: false` also hides the header. */
export function useRingBackdrop(opts: { header?: boolean } = {}) {
  const hideHeader = opts.header === false;
  // A layout effect, so the header and ring change in the same commit as
  // the screen: a page's view transition then snapshots its final layout.
  useLayoutEffect(() => {
    const bump = (by: number) =>
      useBackdrop.setState((s) => ({
        ring: s.ring + by,
        noHeader: s.noHeader + (hideHeader ? by : 0),
      }));
    bump(1);
    return () => bump(-1);
  }, [hideHeader]);
}

/** Hides the header while this screen is up, for screens with their own. */
export function useHideHeader() {
  useLayoutEffect(() => {
    const bump = (by: number) =>
      useBackdrop.setState((s) => ({ noHeader: s.noHeader + by }));
    bump(1);
    return () => bump(-1);
  }, []);
}

export const useRingWanted = () => useBackdrop((s) => s.ring > 0);
export const useHeaderWanted = () => useBackdrop((s) => s.noHeader === 0);

export function RingBackdrop() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    let scene: RingScene | undefined;
    try {
      scene = new RingScene(container.current);
    } catch {
      // No WebGL: the plain ground colour shows instead.
    }
    return () => scene?.dispose();
  }, []);
  return (
    <div
      ref={container}
      aria-hidden="true"
      className="fixed inset-0 -z-10 bg-[#04070a]"
    />
  );
}
