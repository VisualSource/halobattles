import { parentPort, workerData } from "node:worker_threads";
import { buildOptions } from "../map/upgradeList.js";
import units from "../map/units.js";

function runtime() {
  console.log("Complete", workerData);
  parentPort?.postMessage({ results: {} });
}

runtime();
