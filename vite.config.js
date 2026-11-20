import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Relative base so the built app works on GitHub project Pages
  // (e.g. /ring-studio/) as well as locally and in the standalone file.
  base: "./",
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
