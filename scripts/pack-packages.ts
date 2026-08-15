import { resolve } from "node:path";

import { packReleasePackages } from "./release-package-assembly.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts", "packages");

await packReleasePackages(repoRoot, artifactsDirectory);

process.stdout.write(`Packed package artifacts: ${artifactsDirectory}\n`);
