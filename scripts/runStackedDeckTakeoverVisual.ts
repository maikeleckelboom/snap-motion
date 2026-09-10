import { resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const pnpm = resolveRepositoryPnpm(repoRoot);
runPnpmSync(
  pnpm,
  ["exec", "playwright", "test", "--config", "playwright.takeover-visual.config.ts"],
  { cwd: repoRoot },
);
