import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  compareArtifactCaptures,
  defaultComparisonDirectory,
  readArtifactCapture,
  writeComparisonFiles,
} from "./stackedDeckVisualArtifacts.ts";

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    output: { short: "o", type: "string" },
  },
});

if (positionals.length !== 2) {
  throw new Error(
    "Usage: pnpm visual:stacked-deck:compare <artifact-a> <artifact-b> [--output <directory>]",
  );
}

const a = await readArtifactCapture(positionals[0]!);
const b = await readArtifactCapture(positionals[1]!);
const comparison = compareArtifactCaptures(a, b);
const outputDirectory = values.output ? resolve(values.output) : defaultComparisonDirectory(a, b);
await writeComparisonFiles(comparison, outputDirectory);
process.stdout.write(
  `${comparison.compatibility}: wrote ${resolve(outputDirectory, "comparison.json")} and comparison.md\n`,
);
if (comparison.compatibility === "not-directly-comparable") process.exitCode = 2;
