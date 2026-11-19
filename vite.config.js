import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  optimizeDeps: { noDiscovery: true, exclude: ["three", "lucide"] },
  build: {
    outDir: mode === "standalone" ? "dist-standalone" : "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output:
        mode === "standalone"
          ? { inlineDynamicImports: true }
          : {
              manualChunks: {
                three: [
                  "three",
                  "three/addons/controls/OrbitControls.js",
                  "three/addons/environments/RoomEnvironment.js",
                ],
              },
            },
    },
  },
}));
