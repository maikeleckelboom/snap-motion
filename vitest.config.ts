import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@snap-motion/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@snap-motion/vue": fileURLToPath(new URL("./packages/vue/src/index.ts", import.meta.url)),
    },
  },
  test: {
    mockReset: true,
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/test/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "vue",
          environment: "happy-dom",
          include: ["packages/vue/test/**/*.{test,spec}.ts"],
          exclude: ["packages/vue/test/ssr-render.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "vue-ssr",
          environment: "node",
          include: ["packages/vue/test/ssr-render.test.ts"],
        },
      },
    ],
    restoreMocks: true,
  },
});
