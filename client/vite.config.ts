import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // TUNNEL_HOST: the public hostname of a tunnel (say Cloudflare) that sends
  // everything to this dev server. Vite then accepts that host, proxies
  // Nakama's API and socket, and runs HMR over the tunnel's port 443.
  const tunnel = loadEnv(mode, ".", "").TUNNEL_HOST;
  const nakama = "http://localhost:7350";
  return {
    // The router plugin generates src/routeTree.gen.ts from src/routes; it must come before react().
    plugins: [tanstackRouter({ target: "react" }), react(), tailwindcss()],
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
