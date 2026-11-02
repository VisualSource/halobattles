/// <reference types="node" />

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { mapEditor } from "./map-editor.plugin.ts";

/**
 * The Mods whose assets the client bundles: HALO_MODS if set, else the
 * server's deploy env. A build reads only the committed runtime.env, so a
 * git-ignored local Mod (runtime.local.env) never reaches dist/.
 */
function enabledMods(
  command: "build" | "serve",
  list = process.env.HALO_MODS,
): string[] {
  const files = [
    "runtime.env",
    ...(command === "serve" ? ["runtime.local.env"] : []),
  ];
  for (const f of list ? [] : files) {
    const path = new URL(`../deploy/${f}`, import.meta.url);
    if (!existsSync(path)) continue;
    list = readFileSync(path, "utf8").match(/^HALO_MODS=(.*)$/m)?.[1] ?? list;
  }
  const mods = (list ?? "base")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  for (const m of mods)
    if (!/^[a-z0-9_-]+$/.test(m))
      throw new Error(`HALO_MODS: bad Mod name ${m}`);
  return mods;
}

/** Narrows src/assets.ts's glob of every Mod to the enabled ones, before Vite expands it. */
function enabledModAssets(mods: string[]): Plugin {
  const all = '"../../mods/*/assets/**/*"';
  return {
    name: "enabled-mod-assets",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/assets.ts")) return;
      if (!code.includes(all))
        throw new Error(
          `src/assets.ts no longer globs ${all}; update vite.config.ts`,
        );
      return code.replace(
        all,
        JSON.stringify(mods.map((m) => `../../mods/${m}/assets/**/*`)),
      );
    },
  };
}

/** The short commit being built, or "" where git isn't there. */
function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export default defineConfig(({ mode, command }) => {
  // TUNNEL_HOST: the public hostname of a tunnel (say Cloudflare) that sends
  // everything to this dev server. Vite then accepts that host, proxies
  // Nakama's API and socket, and runs HMR over the tunnel's port 443.
  // loadEnv also returns process.env, so a shell HALO_MODS still wins over .env files.
  const env = loadEnv(mode, ".", "");
  const tunnel = env.TUNNEL_HOST;
  const nakama = "http://localhost:7350";
  return {
    // The version and changelog the main menu shows (src/changelog.ts).
    define: {
      __CHANGELOG__: JSON.stringify(
        readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
      ),
      __COMMIT__: JSON.stringify(commit()),
    },
    // The router plugin generates src/routeTree.gen.ts from src/routes; it must come before react().
    plugins: [
      enabledModAssets(enabledMods(command, env.HALO_MODS)),
      mapEditor(enabledMods("serve", env.HALO_MODS)),
      tanstackRouter({ target: "react" }),
      react(),
      tailwindcss(),
    ],
    server: {
      // The base Mod's assets, such as Research field icons, are bundled from ../mods.
      fs: { allow: [".", "../mods"] },
      ...(tunnel && {
        allowedHosts: [tunnel],
        hmr: { clientPort: 443 },
        proxy: {
          "/v2": nakama,
          "/healthcheck": nakama,
          "/ws": { target: nakama, ws: true },
        },
      }),
    },
  };
});
