import { queryOptions, skipToken } from "@tanstack/react-query";
import type { GalaxyMap } from "../gen/content";
import type { IconRequest, IconResult } from "./planet-icons.worker";
import PlanetIconsWorker from "./planet-icons.worker?worker";

/**
 * A map's Planet icons, size pixels square, rendered in a worker: object
 * URLs by Planet id. A Planet always looks the same, so they're kept for the
 * page load. Cancelling stops the worker and frees what it made.
 */
export const planetIconsQuery = (map: GalaxyMap | undefined, size: number) =>
  queryOptions({
    queryKey: ["planetIcons", map?.id, size],
    queryFn: map ? ({ signal }) => renderIcons(map, size, signal) : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false, // a browser without WebGL in workers fails the same way again
  });

function renderIcons(map: GalaxyMap, size: number, signal: AbortSignal) {
  return new Promise<Map<string, string>>((resolve, reject) => {
    if (map.planets.length === 0) return resolve(new Map());
    const worker = new PlanetIconsWorker();
    const urls = new Map<string, string>();
    const stop = (error?: unknown) => {
      worker.terminate();
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) return resolve(urls);
      for (const url of urls.values()) URL.revokeObjectURL(url);
      reject(error);
    };
    const onAbort = () => stop(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onerror = (e) => stop(new Error(e.message));
    worker.onmessage = (e: MessageEvent<IconResult>) => {
      if ("error" in e.data) return stop(new Error(e.data.error));
      urls.set(e.data.id, URL.createObjectURL(e.data.blob));
      if (urls.size === map.planets.length) stop();
    };
    worker.postMessage({
      size,
      planets: map.planets.map(({ id, type, model }) => ({ id, type, model })),
    } satisfies IconRequest);
  });
}
