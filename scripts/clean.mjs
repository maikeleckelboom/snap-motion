import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const generatedPaths = [
  "apps/lab/dist",
  "apps/nuxt-fixture/.nuxt",
  "apps/nuxt-fixture/.output",
  "apps/router-fixture/dist",
  ".artifacts",
  "packages/core/dist",
  "packages/vue/dist",
  "blob-report",
  "coverage",
  "playwright-report",
  "test-results",
  "temp",
];

await Promise.all(
  generatedPaths.map((path) => rm(resolve(repoRoot, path), { force: true, recursive: true })),
);
