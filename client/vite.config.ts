import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  root: __dirname,
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: "::",
    port: Number(process.env.VITE_DEV_PORT || 8080),
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist"),
    emptyOutDir: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: Number(process.env.CLIENT_MAX_CHUNK_KB || 600),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
            return "vendor-react";
          }
          if (id.includes("@tanstack/react-query")) {
            return "vendor-query";
          }
          if (id.includes("recharts")) {
            return "vendor-charts";
          }
          if (
            id.includes("jspdf") ||
            id.includes("html2canvas") ||
            id.includes("qrcode.react")
          ) {
            return "vendor-export";
          }
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          return "vendor";
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
