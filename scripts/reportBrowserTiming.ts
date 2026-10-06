import { appendFile, readFile, writeFile } from "node:fs/promises";

import { browserTiming, type BrowserReport } from "./browserTiming.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: node scripts/reportBrowserTiming.ts <playwright.json> <timing.json>");
const timing = browserTiming(JSON.parse(await readFile(input, "utf8")) as BrowserReport);
await writeFile(
  output,
  `${JSON.stringify({ ...timing, sourceCommit: process.env.GITHUB_SHA, group: process.env.SNAP_MOTION_BROWSER_GROUP }, null, 2)}\n`,
);
const summary = [
  `## Browser timing: ${process.env.SNAP_MOTION_BROWSER_GROUP ?? input}`,
  "",
  `Wall time: ${(timing.wallMilliseconds / 1000).toFixed(1)}s. Flaky: ${timing.outcomes.flaky}; unexpected: ${timing.outcomes.unexpected}; skipped: ${timing.outcomes.skipped}.`,
  "",
  "| Project / spec | Tests | Aggregate test seconds |",
  "| --- | ---: | ---: |",
  ...timing.specs.map(
    (spec) =>
      `| ${spec.project} / ${spec.spec} | ${spec.tests} | ${(spec.milliseconds / 1000).toFixed(1)} |`,
  ),
  "",
  "### Slowest tests",
  "",
  ...timing.top20.map(
    (test) =>
      `- ${test.project}: ${test.title} (${(test.milliseconds / 1000).toFixed(1)}s, ${test.retries} retries)`,
  ),
  "",
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
process.stdout.write(summary);
