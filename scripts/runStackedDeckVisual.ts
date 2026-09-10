import { resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";
import { resolveStackedDeckVisualScenario } from "./stackedDeckVisualScenario.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const cliArguments = process.argv.slice(2);

if (cliArguments.includes("--help")) {
  process.stdout.write(`Usage: pnpm visual:stacked-deck [-- <options>]

Options:
  --scenario review|curve       Select the full review or short curve scenario
  --pair START:TARGET           Use another adjacent card pair
  --viewport WIDTHxHEIGHT       Override the review viewport
  --slow-duration MS            Override each held traversal duration
  --slow-cadence MS             Override held traversal input cadence
  --slow-max-progress 0..1      Override the held traversal endpoint
  --normal-duration MS          Override full-review normal gesture duration
  --normal-cadence MS           Override full-review normal gesture cadence
  --repetitions COUNT           Override alternating full-review gestures

No arguments runs the frozen canonical review. Every explicit selection or override is non-canonical.
`);
  process.exit(0);
}

const scenario = resolveStackedDeckVisualScenario(cliArguments);
const pnpm = resolveRepositoryPnpm(repoRoot);
runPnpmSync(pnpm, ["exec", "playwright", "test", "--config", "playwright.visual.config.ts"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SNAP_MOTION_STACKED_DECK_VISUAL_SCENARIO: JSON.stringify(scenario),
  },
});
