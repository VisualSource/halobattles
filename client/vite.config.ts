import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts from src/routes; it must come before react().
  plugins: [tanstackRouter({ target: "react" }), react(), tailwindcss()],
});
