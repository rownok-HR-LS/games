import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One site, one page per game. Add each new game folder to `input`.
// Served from GitHub Pages at /games/, so every game lives at /games/<folder>/.
export default defineConfig({
  base: "/games/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        "brick-blaster": resolve(__dirname, "brick-blaster/index.html"),
      },
    },
  },
});
