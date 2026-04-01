import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function getNodeModulePackageName(id: string) {
  const normalized = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return null;
  const remainder = normalized.slice(markerIndex + marker.length);
  if (!remainder) return null;
  const [scopeOrName, maybeName] = remainder.split("/");
  if (!scopeOrName) return null;
  if (scopeOrName.startsWith("@") && maybeName) {
    return `${scopeOrName}/${maybeName}`;
  }
  return scopeOrName;
}

function resolveVendorChunk(id: string) {
  const pkg = getNodeModulePackageName(id);
  if (!pkg) return undefined;

  if (["@remix-run/router", "react", "react-dom", "react-router", "react-router-dom", "scheduler"].includes(pkg)) {
    return "vendor-react";
  }

  if (["@tanstack/react-query", "@tanstack/query-core"].includes(pkg)) {
    return "vendor-query";
  }

  if (pkg.startsWith("@radix-ui/")) {
    return "vendor-radix";
  }

  if (
    [
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "sonner",
      "tailwind-merge",
    ].includes(pkg)
  ) {
    return "vendor-ui";
  }

  if (["@hookform/resolvers", "react-hook-form", "zod"].includes(pkg)) {
    return "vendor-forms";
  }

  if (["date-fns"].includes(pkg)) {
    return "vendor-date";
  }

  if (["jspdf", "jspdf-autotable", "qrcode.react"].includes(pkg)) {
    return "vendor-docs";
  }

  if (
    pkg === "recharts" ||
    pkg.startsWith("d3-") ||
    ["eventemitter3", "internmap", "lodash", "lodash-es", "react-is", "robust-predicates", "victory-vendor"].includes(pkg)
  ) {
    return "vendor-charts";
  }

  return "vendor";
}

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
          return resolveVendorChunk(id);
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
