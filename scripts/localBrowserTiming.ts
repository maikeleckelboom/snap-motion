import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { browserTiming, type BrowserReport } from "./browserTiming.ts";

/**
 * Runs Playwright with the arguments given and prints where its time went, for local iteration:
 *
 *   node scripts/localBrowserTiming.ts e2e/studio --project=chromium
 *
 * It adds a JSON reporter beside the normal list output, then summarizes the result with the same
 * `browserTiming` the CI report uses, so a local number and a CI number are read the same way. It
 * runs exactly the tests it is given: it filters nothing, changes no worker count and retries
 * nothing. The summary is a signal for choosing what to speed up, never an assertion.
 */
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".artifacts", "timing", "last-local-run.json");
mkdirSync(resolve(output, ".."), { recursive: true });

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2), "--reporter=list,json"],
  {
    cwd: root,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: output },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

let report: BrowserReport;
try {
  report = JSON.parse(readFileSync(output, "utf8")) as BrowserReport;
} catch {
  process.stderr.write("\nNo timing report was written; Playwright did not finish a run.\n");
  process.exit(result.status ?? 1);
}
const timing = browserTiming(report);
const seconds = (milliseconds: number) => (milliseconds / 1000).toFixed(1);
const lines = [
  "",
  `Wall ${seconds(timing.wallMilliseconds)}s. Aggregate test time ${seconds(
    timing.specs.reduce((total, spec) => total + spec.milliseconds, 0),
  )}s. Unexpected ${timing.outcomes.unexpected}, flaky ${timing.outcomes.flaky}, skipped ${timing.outcomes.skipped}.`,
  "",
  ...timing.specs.map(
    (spec) =>
      `  ${spec.project} / ${spec.spec}: ${spec.tests} tests, ${seconds(spec.milliseconds)}s`,
  ),
  "",
  "Slowest:",
  ...timing.top20
    .slice(0, 8)
    .map((test) => `  ${seconds(test.milliseconds)}s  ${test.project}: ${test.title}`),
  "",
  `Full report: ${output}`,
  "",
];
process.stdout.write(lines.join("\n"));
process.exit(result.status ?? 0);
