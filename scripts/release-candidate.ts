import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";
import {
  assertAttachedSourceBranch,
  assertCandidateEligible,
  finalizeNewCandidate,
  pendingChangesets,
  type CandidatePackageVersion,
} from "./release-candidate-lifecycle.ts";
import {
  candidateHistory,
  serializeCandidateRecord,
  type CandidateRecord,
} from "./release-candidate-record.ts";
import { inspectReleasePackages } from "./release-package-assembly.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsRoot = resolve(repoRoot, ".artifacts");
const packageDirectory = resolve(artifactsRoot, "packages");
const candidateHistoryDirectory = resolve(repoRoot, "config/release-candidates");
const changesetDirectory = resolve(repoRoot, ".changeset");

function capture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `${command} failed.`);
  return result.stdout.trim();
}

function assertCleanWorktree(): void {
  if (capture("git", ["status", "--porcelain=v1", "--untracked-files=normal"]) !== "") {
    throw new Error(
      "Release candidates require a clean worktree so their source provenance is exact.",
    );
  }
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

// Detached source checkouts fail before eligibility, verification, or the exclusive record reservation.
const sourceBranch = assertAttachedSourceBranch(capture("git", ["branch", "--show-current"]));
const candidatePackages = await currentPackageVersions();
const candidateVersion = assertCandidateEligible(
  candidatePackages,
  await candidateHistory(candidateHistoryDirectory),
  await currentPendingChangesets(),
);

// Eligibility must be proven before the full verification path repacks and replaces ignored output.
assertCleanWorktree();
const pnpm = resolveRepositoryPnpm(repoRoot);
runPnpmSync(pnpm, ["release:check"], { cwd: repoRoot });
assertCleanWorktree();

// `release:check` builds package authority once, packs it once, then certifies those exact archives
// through the static and Chromium consumers. Later browser and fixture gates do not mutate them.
const packages = await inspectReleasePackages(packageDirectory);
const commit = capture("git", ["rev-parse", "HEAD"]);
const record: CandidateRecord = {
  schemaVersion: 1,
  createdAt: capture("git", ["show", "-s", "--format=%cI", commit]),
  source: {
    repository: "https://github.com/maikeleckelboom/snap-motion",
    visibility: "public",
    branch: sourceBranch,
    commit,
  },
  verification: { command: "pnpm release:check", passed: true },
  packages,
  private: true,
  published: false,
  intendedDistTag: "beta",
  blockers: JSON.parse(
    await readFile(resolve(repoRoot, "config/release-blockers.json"), "utf8"),
  ) as readonly Record<string, unknown>[],
};
const candidateRecord = resolve(candidateHistoryDirectory, `${candidateVersion}.json`);
const formattedRecord = spawnSync(
  pnpm.command,
  [...pnpm.argsPrefix, "exec", "oxfmt", "--stdin-filepath", candidateRecord],
  {
    cwd: repoRoot,
    encoding: "utf8",
    input: serializeCandidateRecord(record),
  },
);
if (formattedRecord.status !== 0) {
  throw (
    formattedRecord.error ??
    new Error(formattedRecord.stderr || "Could not format the candidate record before reservation.")
  );
}
const recordSource = formattedRecord.stdout;

await finalizeNewCandidate({
  artifactsRoot,
  candidateRecord,
  packageSourceDirectory: packageDirectory,
  packages,
  recordSource,
});
process.stdout.write(
  `Prepared and certified new release candidate ${candidateVersion} from source commit ${commit}. Review and commit config/release-candidates/${candidateVersion}.json; ignored artifacts are in .artifacts/packages and .artifacts/release.\n`,
);
