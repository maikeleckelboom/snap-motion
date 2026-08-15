import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts", "packages");
const pnpm = resolveRepositoryPnpm(repoRoot);

function runPnpm(args: readonly string[], cwd = repoRoot) {
  runPnpmSync(pnpm, args, { cwd });
}

await rm(artifactsDirectory, { force: true, recursive: true });
await mkdir(artifactsDirectory, { recursive: true });
runPnpm(["build:packages"]);
runPnpm(
  ["pack", "--out", "../../.artifacts/packages/snap-motion-core-%v.tgz"],
  resolve(repoRoot, "packages/core"),
);
runPnpm(
  ["pack", "--out", "../../.artifacts/packages/snap-motion-vue-%v.tgz"],
  resolve(repoRoot, "packages/vue"),
);

process.stdout.write(`Packed package artifacts: ${artifactsDirectory}\n`);
