import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts from src/routes; it must come before react().
  plugins: [tanstackRouter({ target: "react" }), react(), tailwindcss()],
  // The base Mod's assets, such as Research field icons, are bundled from ../mods.
  server: { fs: { allow: [".", "../mods"] } },
});
