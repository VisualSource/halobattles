import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const __getFilename = (importMeta) =>
  fileURLToPath(importMeta ?? import.meta.url);
export const __getDirname = (importMeta) => dirname(__getFilename(importMeta));

export function assign(obj, prop, value) {
  if (typeof prop === "string") prop = prop.split(".");

  if (prop.length > 1) {
    const e = prop.shift();

    if (typeof obj[e] !== "object") {
      obj[e] = {};
    }
    assign(obj[e], prop, value);
    return;
  }

  obj[prop[0]] = value;
}

/** @typedef {{ root: string; mapsFolder: string, buildingFile: string, planetsFile: string, unitsFile: string; }} FilePaths */
/** @typedef {{ app: FilePaths, parsedURL: URL, body: Promise<string>, form: Promise<URLSearchParams> }} ExtendRequest */
/** @typedef {{ html(data: string, status?: number): void; json(data: unknown, status?: number): void; sendFile(file: string, status?: number): void; redirect(path: string, status?: number): void; }} ExtendedResponse */
/** @typedef {import("node:http").IncomingMessage & ExtendRequest } EditorRequest */
/** @typedef {import("node:http").ServerResponse<import("node:http").IncomingMessage> & ExtendedResponse } EditorResponse  */
