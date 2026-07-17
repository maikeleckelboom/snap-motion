import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  build: {
    emptyOutDir: false,
    lib: {
      cssFileName: "style",
      entry: {
        components: "src/components.ts",
        composables: "src/composables.ts",
        index: "src/index.ts",
        styleEntry: "src/style-entry.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@snap-motion/core", "@vueuse/core", "motion", "vue"],
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
});
