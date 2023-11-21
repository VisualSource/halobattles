import { parentPort } from "node:worker_threads";
export const log = (...msg: unknown[]) => parentPort?.postMessage({ type: "message", msg });