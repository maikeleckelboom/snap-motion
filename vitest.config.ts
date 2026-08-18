import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

import { workspaceSourceAliases } from "./config/source-entrypoints";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: workspaceSourceAliases(),
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
          name: "lab",
          environment: "node",
          include: ["apps/lab/test/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.{test,spec}.ts"],
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
