import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@page": path.resolve(__dirname, "./src/pages"),
      "@component": path.resolve(__dirname, "./src/components"),
      "@hook": path.resolve(__dirname, "./src/hooks")
    }
  }
})
