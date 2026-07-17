import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  ignorePatterns: [
    "legacy/**",
    "**/dist/**",
    "coverage/**",
    "blob-report/**",
    "playwright-report/**",
    "test-results/**",
  ],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
    // Type-aware Oxlint requires TypeScript 7, but vue-tsc 3.3.7 cannot run on it yet.
    typeAware: false,
  },
  overrides: [
    {
      files: ["*.config.ts", "**/*.config.ts", "scripts/**/*.mjs"],
      env: { node: true },
    },
    {
      files: [
        "apps/**/*.ts",
        "apps/**/*.vue",
        "packages/vue/src/**/*.ts",
        "packages/vue/src/**/*.vue",
      ],
      env: { browser: true },
    },
    {
      files: ["packages/core/test/**/*.ts"],
      env: { node: true, vitest: true },
    },
    {
      files: ["packages/vue/test/**/*.ts"],
      env: { browser: true, node: true, vitest: true },
    },
    {
      files: ["e2e/**/*.ts"],
      env: { browser: true, node: true },
    },
  ],
  plugins: ["eslint", "typescript", "unicorn", "oxc", "promise", "vue", "vitest"],
  rules: {
    "no-console": "error",
    "no-debugger": "error",
    "promise/always-return": "error",
    "promise/catch-or-return": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/no-explicit-any": "error",
  },
});
