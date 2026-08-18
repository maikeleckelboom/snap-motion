import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";
import { assertReleaseCandidateHistory } from "./release-candidate-history.ts";
import {
  alignedCandidateVersion,
  materializeCandidateArtifacts,
} from "./release-candidate-lifecycle.ts";
import { assertPackageAuthorityMatches, readCandidateRecord } from "./release-candidate-record.ts";
import { inspectReleasePackages, packReleasePackages } from "./release-package-assembly.ts";

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw result.error ?? new Error(result.stderr || `git ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function validCandidateVersion(version: string): string {
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) {
    throw new Error(`Invalid release-candidate version ${JSON.stringify(version)}.`);
  }
  return version;
}

export interface VerifiedCandidate {
  readonly packageCount: number;
  readonly sourceCommit: string;
  readonly version: string;
}

export async function verifyRecordedCandidate(
  repositoryRoot: string,
  selectedVersion: string,
): Promise<VerifiedCandidate> {
  const version = validCandidateVersion(selectedVersion);
  assertReleaseCandidateHistory(repositoryRoot);
  const recordPath = resolve(repositoryRoot, `config/release-candidates/${version}.json`);
  let recordAuthority;
  try {
    recordAuthority = await readCandidateRecord(recordPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Release candidate ${version} has no committed producer record at config/release-candidates/${version}.json. Prepare it locally with pnpm release:candidate:prepare, then review and commit the immutable producer record. GitHub Actions verifies recorded candidates only.`,
        { cause: error },
      );
    }
    throw error;
  }
  const { record, source: recordSource } = recordAuthority;
  const recordedVersion = alignedCandidateVersion(record.packages);
  if (recordedVersion !== version) {
    throw new Error(
      `Candidate selection ${version} conflicts with the recorded package version ${recordedVersion}.`,
    );
  }

  const sourceCommit = git(repositoryRoot, ["rev-parse", `${record.source.commit}^{commit}`]);
  if (sourceCommit !== record.source.commit) {
    throw new Error(
      `Recorded source commit ${record.source.commit} does not resolve to the exact recorded authority; resolved ${sourceCommit}.`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "snap-motion-candidate-"));
  const sourceWorktree = resolve(temporaryRoot, "source");
  let worktreeAdded = false;
  let result: VerifiedCandidate | undefined;
  let primaryError: unknown;

  try {
    git(repositoryRoot, ["worktree", "add", "--detach", sourceWorktree, sourceCommit]);
    worktreeAdded = true;
    const checkedOutCommit = git(sourceWorktree, ["rev-parse", "HEAD"]);
    if (checkedOutCommit !== record.source.commit) {
      throw new Error(
        `Historical worktree checked out ${checkedOutCommit}, expected ${record.source.commit}.`,
      );
    }

    const pnpm = resolveRepositoryPnpm(sourceWorktree);
    runPnpmSync(pnpm, ["install", "--frozen-lockfile"], { cwd: sourceWorktree });
    const historicalPackages = resolve(sourceWorktree, ".artifacts/packages");
    await packReleasePackages(sourceWorktree, historicalPackages);
    const assembledPackages = await inspectReleasePackages(historicalPackages);
    assertPackageAuthorityMatches(record.packages, assembledPackages);

    if ((await readFile(recordPath, "utf8")) !== recordSource) {
      throw new Error(
        `Candidate record ${version} changed while verification was running; refusing to materialize artifacts.`,
      );
    }
    await materializeCandidateArtifacts({
      artifactsRoot: resolve(repositoryRoot, ".artifacts"),
      packageSourceDirectory: historicalPackages,
      packages: record.packages,
      recordSource,
    });
    if ((await readFile(recordPath, "utf8")) !== recordSource) {
      throw new Error(`Candidate record ${version} changed during artifact materialization.`);
    }

    result = { version, sourceCommit, packageCount: assembledPackages.length };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError: unknown;
  if (worktreeAdded) {
    try {
      git(repositoryRoot, ["worktree", "remove", "--force", sourceWorktree]);
    } catch (error) {
      cleanupError = error;
      spawnSync("git", ["worktree", "prune"], { cwd: repositoryRoot, encoding: "utf8" });
    }
  }
  try {
    await rm(temporaryRoot, { force: true, recursive: true });
  } catch (error) {
    cleanupError ??= error;
  }

  if (primaryError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Recorded-candidate verification failed and temporary worktree cleanup also failed.",
    );
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
  if (!result) throw new Error("Recorded-candidate verification produced no result.");
  return result;
}
