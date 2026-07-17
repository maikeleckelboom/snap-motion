import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts", "packages");

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: true, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(artifactsDirectory, { force: true, recursive: true });
await mkdir(artifactsDirectory, { recursive: true });
run("pnpm", ["build:packages"]);
run(
  "pnpm",
  ["pack", "--out", "../../.artifacts/packages/snap-motion-core-%v.tgz"],
  resolve(repoRoot, "packages/core"),
);
run(
  "pnpm",
  ["pack", "--out", "../../.artifacts/packages/snap-motion-vue-%v.tgz"],
  resolve(repoRoot, "packages/vue"),
);

process.stdout.write(`Packed package artifacts: ${artifactsDirectory}\n`);
