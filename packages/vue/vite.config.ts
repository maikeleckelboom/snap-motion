import { readFile } from "node:fs/promises";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "snap-motion-structural-style",
      async generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "style.css",
          source: await readFile(new URL("./src/style.css", import.meta.url), "utf8"),
        });
      },
    },
  ],
  build: {
    emptyOutDir: false,
    lib: {
      cssFileName: "style",
      entry: {
        "bottom-sheet": "src/bottom-sheet/index.ts",
        carousel: "src/carousel/index.ts",
        dialog: "src/dialog/index.ts",
        index: "src/index.ts",
        localization: "src/localization/index.ts",
        motion: "src/motion/index.ts",
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
