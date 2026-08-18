import { resolve } from "node:path";

import { packPreparedReleasePackages, packReleasePackages } from "./release-package-assembly.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts", "packages");

const prepared = process.argv.slice(2).includes("--prepared");
await (prepared ? packPreparedReleasePackages : packReleasePackages)(repoRoot, artifactsDirectory);

process.stdout.write(`Packed package artifacts: ${artifactsDirectory}\n`);
