import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // alles unter /api an das Backend (damit auch /api/wms bspw geht)
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },

      // eigentlich redundant?
      "/api/v1": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
