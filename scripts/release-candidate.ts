import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { packedText, readPackedArchive } from "./packedArchive.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const packageDirectory = resolve(repoRoot, ".artifacts/packages");
const releaseDirectory = resolve(repoRoot, ".artifacts/release");
const pnpmCli = resolve(dirname(process.execPath), "node_modules/corepack/dist/pnpm.js");

function capture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `${command} failed.`);
  return result.stdout.trim();
}

const worktreeStatus = capture("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
if (worktreeStatus !== "") {
  throw new Error(
    "Release candidates require a clean worktree so their source provenance is exact.",
  );
}

const verification = spawnSync(process.execPath, [pnpmCli, "release:check"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});
if (verification.status !== 0) process.exit(verification.status ?? 1);

// `release:check` continues into browser and fixture gates after its packed-consumer proof. Repack
// and recertify last so the bytes hashed below are exactly the bytes a clean consumer exercised.
const packedVerification = spawnSync(process.execPath, [pnpmCli, "verify:packages"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});
if (packedVerification.status !== 0) process.exit(packedVerification.status ?? 1);

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });
const artifacts = (await readdir(packageDirectory))
  .filter((file) => file.endsWith(".tgz"))
  .toSorted();
interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly private: boolean;
  readonly sideEffects: boolean | readonly string[];
  readonly version: string;
}

interface ReleasePackage {
  readonly bytes: number;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly exports: readonly string[];
  readonly file: string;
  readonly name: string;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly private: boolean;
  readonly sha256: string;
  readonly sideEffects: boolean | readonly string[];
  readonly version: string;
}

function exportTargets(value: unknown): readonly string[] {
  if (typeof value === "string") return value.startsWith("./") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}

const packageManifests = await Promise.all(
  artifacts.map(async (artifact) => {
    const entries = await readPackedArchive(resolve(packageDirectory, artifact));
    const manifest = JSON.parse(packedText(entries, "package/package.json")) as PackageManifest;
    for (const target of exportTargets(manifest.exports)) {
      const packedTarget = `package/${target.slice(2)}`;
      if (!entries.has(packedTarget)) {
        throw new Error(`${artifact} export target does not exist: ${target}`);
      }
    }
    return manifest;
  }),
);
const packages: ReleasePackage[] = [];
for (const artifact of artifacts) {
  const data = await readFile(resolve(packageDirectory, artifact));
  const manifest = packageManifests.find((candidate) =>
    artifact.startsWith(`${candidate.name.replace("@", "").replace("/", "-")}-`),
  );
  if (!manifest) throw new Error(`No packed package manifest matches ${artifact}.`);
  packages.push({
    name: manifest.name,
    version: manifest.version,
    file: artifact,
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
    private: manifest.private,
    sideEffects: manifest.sideEffects,
    exports: Object.keys(manifest.exports).toSorted(),
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
  });
}

const blockers = JSON.parse(
  await readFile(resolve(repoRoot, "config/release-blockers.json"), "utf8"),
) as readonly Record<string, unknown>[];
const commit = capture("git", ["rev-parse", "HEAD"]);
const createdAt = capture("git", ["show", "-s", "--format=%cI", "HEAD"]);

await writeFile(
  resolve(releaseDirectory, "SHA256SUMS"),
  `${packages.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`,
);
await writeFile(
  resolve(releaseDirectory, "release-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      createdAt,
      source: {
        repository: "https://github.com/maikeleckelboom/snap-motion",
        visibility: "public",
        branch: capture("git", ["branch", "--show-current"]),
        commit,
      },
      verification: { command: "pnpm release:check", passed: true },
      packages,
      private: true,
      published: false,
      intendedDistTag: "beta",
      blockers,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`Release candidate artifacts created in ${basename(releaseDirectory)}\n`);
