import { resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const candidate = process.argv[2] ?? "production";
if (!/^[a-z0-9-]+$/.test(candidate)) {
  throw new Error(
    "Direct visual candidate must contain only lowercase letters, numbers, and dashes.",
  );
}

const pnpm = resolveRepositoryPnpm(repoRoot);
runPnpmSync(
  pnpm,
  ["exec", "playwright", "test", "--config", "playwright.direct-visual.config.ts"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      SNAP_MOTION_DIRECT_VISUAL_CANDIDATE: candidate,
    },
  },
);
