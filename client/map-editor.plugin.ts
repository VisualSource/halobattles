/// <reference types="node" />

import { execFile } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyEdits,
  findNodeAtLocation,
  modify,
  type ParseError,
  parse,
  parseTree,
} from "jsonc-parser";
import type { Plugin } from "vite";

// The dev-only map editor's endpoints (client/editor.html): read the planet
// list and base Mod data, open a map, and save one into mods/base/data/maps,
// then run halo-mod check on the result. Under `vite` only, never a build.

const repo = new URL("../", import.meta.url);
const file = (path: string) => new URL(path, repo);
const MAPS = "mods/base/data/maps/";
const ID = /^[a-z0-9_-]+$/;

function readJsonc(path: string): unknown {
  const errors: ParseError[] = [];
  const v = parse(readFileSync(file(path), "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length) throw new Error(`${path}: invalid JSONC`);
  return v;
}

const jsoncIn = (dir: string) =>
  readdirSync(file(dir))
    .filter((f) => f.endsWith(".jsonc"))
    .sort()
    .map((f) => ({
      name: f.slice(0, -".jsonc".length),
      value: readJsonc(dir + f) as Record<string, unknown>,
    }));

/** One line per item for arrays of objects, like the hand-written maps. */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object")
    return `{ ${Object.entries(v)
      .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
      .join(", ")} }`;
  return JSON.stringify(v);
}
function format(v: unknown): string {
  if (Array.isArray(v) && v.some((x) => x && typeof x === "object"))
    return `[\n${v.map((x) => `    ${inline(x)}`).join(",\n")}\n  ]`;
  if (Array.isArray(v)) return inline(v);
  return JSON.stringify(v, null, 2).replace(/\n/g, "\n  ");
}

/**
 * The map file with map's values: each top-level key that changed is
 * rewritten in place, so comments elsewhere in the file survive.
 */
export function mapText(
  old: string | undefined,
  map: Record<string, unknown>,
): string {
  if (old === undefined) {
    const body = Object.entries({
      $schema: "../../../../schema/content/map.schema.json",
      ...map,
    })
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${format(v)}`)
      .join(",\n");
    return `{\n${body}\n}\n`;
  }
  let text = old;
  const was = parse(old, [], { allowTrailingComma: true }) as Record<
    string,
    unknown
  >;
  const opts = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
  for (const key of Object.keys(was))
    if (key !== "$schema" && !(key in map))
      text = applyEdits(text, modify(text, [key], undefined, opts));
  for (const [key, v] of Object.entries(map)) {
    if (JSON.stringify(was[key]) === JSON.stringify(v)) continue;
    const node = findNodeAtLocation(
      parseTree(text) ?? { type: "null", offset: 0, length: 0 },
      [key],
    );
    text = node
      ? text.slice(0, node.offset) +
        format(v) +
        text.slice(node.offset + node.length)
      : applyEdits(text, modify(text, [key], v, opts));
  }
  return text;
}

/** Only this machine, by name: the dev server also listens on the LAN, and a tunnel arrives over loopback. */
function local(req: IncomingMessage) {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  const from = req.socket.remoteAddress ?? "";
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(host) &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(from)
  );
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const check = (mods: string[]) =>
  new Promise<{ ok: boolean; output: string }>((resolve) =>
    execFile(
      "go",
      ["run", "./cmd/halo-mod", "check", ...mods.map((m) => `../mods/${m}`)],
      { cwd: file("server/"), timeout: 120_000 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, output: `${stdout}${stderr}`.trim() }),
    ),
  );

async function body(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 5_000_000) throw new Error("map too large");
  }
  return s;
}

export function mapEditor(mods: string[]): Plugin {
  return {
    name: "map-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor", async (req, res) => {
        if (!local(req))
          return send(res, 403, {
            error: "the map editor only answers this machine",
          });
        try {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (req.method === "GET" && url.pathname === "/data") {
            const rules = readJsonc("mods/base/data/rulesets/rules.jsonc") as {
              laneTypes?: Record<string, number>;
            };
            return send(res, 200, {
              planets: JSON.parse(
                readFileSync(file("tools/map-editor/planets.json"), "utf8"),
              ),
              planetTypes: jsoncIn("mods/base/data/planetTypes/").map(
                ({ value }) => ({ id: value.id, name: value.name }),
              ),
              units: jsoncIn("mods/base/data/units/").map(({ value }) => ({
                id: value.id,
                name: value.name,
                faction: value.faction,
                commandPoints: value.commandPoints,
              })),
              laneTypes: rules.laneTypes ?? {},
              maps: jsoncIn(MAPS).map((m) => m.name),
            });
          }
          const id = url.pathname.match(/^\/maps\/([^/]+)$/)?.[1];
          if (!id || !ID.test(id))
            return send(res, 400, { error: "bad map id" });
          const path = file(`${MAPS}${id}.jsonc`);
          if (req.method === "GET")
            return send(res, 200, readJsonc(`${MAPS}${id}.jsonc`));
          if (req.method === "PUT") {
            const map = JSON.parse(await body(req)) as Record<string, unknown>;
            if (map.id !== id)
              return send(res, 400, {
                error: "the map's id must match its file",
              });
            let old: string | undefined;
            try {
              old = readFileSync(path, "utf8");
            } catch {
              old = undefined;
            }
            writeFileSync(path, mapText(old, map));
            return send(res, 200, {
              file: `${MAPS}${id}.jsonc`,
              ...(await check(mods)),
            });
          }
          send(res, 405, { error: "method not allowed" });
        } catch (e) {
          send(res, 500, { error: String(e) });
        }
      });
    },
  };
}
