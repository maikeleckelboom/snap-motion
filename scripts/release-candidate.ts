import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { packedText, readPackedArchive } from "./packedArchive.ts";
import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";
import {
  alignedCandidateVersion,
  assertCandidateEligible,
  pendingChangesets,
  type CandidateHistoryEntry,
  type CandidatePackageVersion,
} from "./release-candidate-lifecycle.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const packageDirectory = resolve(repoRoot, ".artifacts/packages");
const releaseDirectory = resolve(repoRoot, ".artifacts/release");
const candidateHistoryDirectory = resolve(repoRoot, "config/release-candidates");
const changesetDirectory = resolve(repoRoot, ".changeset");

function capture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `${command} failed.`);
  return result.stdout.trim();
}

interface WorkspacePackageManifest {
  readonly name: string;
  readonly version: string;
}

interface ChangesetPreState {
  readonly changesets: readonly string[];
}

async function currentPackageVersions(): Promise<readonly CandidatePackageVersion[]> {
  return Promise.all(
    ["core", "vue"].map(async (packageName) => {
      const manifest = JSON.parse(
        await readFile(resolve(repoRoot, `packages/${packageName}/package.json`), "utf8"),
      ) as WorkspacePackageManifest;
      return { name: manifest.name, version: manifest.version };
    }),
  );
}

async function candidateHistory(): Promise<readonly CandidateHistoryEntry[]> {
  const files = (await readdir(candidateHistoryDirectory))
    .filter((file) => file.endsWith(".json"))
    .toSorted();
  return Promise.all(
    files.map(async (file) => {
      const manifest = JSON.parse(
        await readFile(resolve(candidateHistoryDirectory, file), "utf8"),
      ) as { readonly packages?: readonly CandidatePackageVersion[] };
      if (!manifest.packages) {
        throw new Error(`Archived candidate manifest has no packages: ${file}`);
      }
      const version = alignedCandidateVersion(manifest.packages);
      if (file !== `${version}.json`) {
        throw new Error(`Archived candidate manifest ${file} must be named ${version}.json.`);
      }
      return {
        file: `config/release-candidates/${file}`,
        packages: manifest.packages,
      };
    }),
  );
}

async function currentPendingChangesets() {
  const preState = JSON.parse(
    await readFile(resolve(changesetDirectory, "pre.json"), "utf8"),
  ) as ChangesetPreState;
  const files = (await readdir(changesetDirectory))
    .filter((file) => file.endsWith(".md"))
    .toSorted();
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        basename(file, ".md"),
        await readFile(resolve(changesetDirectory, file), "utf8"),
      ]),
    ),
  );
  return pendingChangesets(sources, preState.changesets);
}

const candidatePackages = await currentPackageVersions();
const candidateVersion = assertCandidateEligible(
  candidatePackages,
  await candidateHistory(),
  await currentPendingChangesets(),
);

const worktreeStatus = capture("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
if (worktreeStatus !== "") {
  throw new Error(
    "Release candidates require a clean worktree so their source provenance is exact.",
  );
}

const pnpm = resolveRepositoryPnpm(repoRoot);
runPnpmSync(pnpm, ["release:check"], { cwd: repoRoot });

// `release:check` continues into browser and fixture gates after its packed-consumer proof. Repack
// and recertify last so the bytes hashed below are exactly the bytes a clean consumer exercised.
runPnpmSync(pnpm, ["verify:packages"], { cwd: repoRoot });

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
const manifestSource = `${JSON.stringify(
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
)}\n`;
const candidateRecord = resolve(candidateHistoryDirectory, `${candidateVersion}.json`);

// Reserve the immutable producer record before replacing any prior ignored release output. The
// preflight above makes ordinary collisions fail before verification or package regeneration; the
// exclusive write also closes a concurrent or interrupted finalization race.
await writeFile(candidateRecord, manifestSource, { encoding: "utf8", flag: "wx" });
runPnpmSync(pnpm, ["exec", "oxfmt", "--write", candidateRecord], { cwd: repoRoot });

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });

await writeFile(
  resolve(releaseDirectory, "SHA256SUMS"),
  `${packages.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`,
);
await writeFile(resolve(releaseDirectory, "release-manifest.json"), manifestSource);
process.stdout.write(
  `Release candidate artifacts created in ${basename(releaseDirectory)}; commit the generated producer record ${candidateVersion}.json to certify its immutable history.\n`,
);
