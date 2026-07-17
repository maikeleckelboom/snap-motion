import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["@snap-motion/core", "motion", "vue"],
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
});
