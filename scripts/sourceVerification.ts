import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  inspectReleasePackages,
  type ReleasePackageAuthority,
} from "./release-package-assembly.ts";

const repository = "maikeleckelboom/snap-motion";
export const sourceVerificationJobs = [
  "Repository admission",
  "Linux verification",
  "Windows portability",
  "Chromium general",
  "Chromium deck",
  "Chromium direct",
  "Interoperability firefox",
  "Interoperability webkit",
  "Interoperability webkit-stacked-deck",
  "Browser integration",
  "Browser certification",
] as const;

export interface SourceWorkflowRun {
  readonly id: number;
  readonly run_attempt: number;
  readonly head_sha: string;
  readonly head_branch: string;
  readonly event: string;
  readonly path: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly html_url: string;
}
export interface SourceVerificationEvidence {
  readonly schemaVersion: 1;
  readonly repository: string;
  readonly sourceCommit: string;
  readonly runId: number;
  readonly runAttempt: number;
  readonly packages: readonly ReleasePackageAuthority[];
}

export function assertSourceWorkflow(
  run: SourceWorkflowRun,
  sourceCommit: string,
  branch: string,
  jobs: readonly { readonly name: string; readonly conclusion: string | null }[],
): void {
  if (
    run.head_sha !== sourceCommit ||
    run.head_branch !== branch ||
    run.path !== ".github/workflows/verify.yml" ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.html_url !== `https://github.com/${repository}/actions/runs/${run.id}` ||
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt <= 0
  ) {
    throw new Error(
      "Candidate source requires a completed successful authoritative Verify run for the exact source SHA and branch.",
    );
  }
  for (const owner of sourceVerificationJobs) {
    const matches = jobs.filter((job) => job.name === owner);
    if (matches.length !== 1 || matches[0]?.conclusion !== "success")
      throw new Error(
        `Candidate source owner ${owner} did not succeed exactly once in this run attempt.`,
      );
  }
}

export function assertSourceEvidence(
  evidence: SourceVerificationEvidence,
  run: SourceWorkflowRun,
  packages: readonly ReleasePackageAuthority[],
): void {
  if (
    evidence.schemaVersion !== 1 ||
    evidence.repository !== repository ||
    evidence.sourceCommit !== run.head_sha ||
    evidence.runId !== run.id ||
    evidence.runAttempt !== run.run_attempt ||
    !isDeepStrictEqual(evidence.packages, packages)
  ) {
    throw new Error(
      "Downloaded source evidence or package archive identity does not match the authoritative GitHub run.",
    );
  }
}

function githubJson<T>(path: string): T {
  return JSON.parse(
    execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  ) as T;
}

/** Only GitHub's completed full matrix and its immutable artifact are accepted; no local markers. */
export async function fetchVerifiedSource(
  sourceCommit: string,
  branch: string,
  destination: string,
) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || !branch)
    throw new Error("Exact attached source identity is required.");
  if ((await readdir(destination)).length !== 0)
    throw new Error("Source evidence must download into a fresh empty directory.");
  const runs = githubJson<{ workflow_runs: SourceWorkflowRun[] }>(
    `repos/${repository}/actions/workflows/verify.yml/runs?head_sha=${sourceCommit}&status=success&per_page=100`,
  ).workflow_runs;
  const run = runs.find(
    (candidate) =>
      candidate.head_sha === sourceCommit &&
      candidate.head_branch === branch &&
      ["push", "workflow_dispatch"].includes(candidate.event) &&
      candidate.conclusion === "success",
  );
  if (!run)
    throw new Error(
      `Push source ${sourceCommit} and wait for complete GitHub Verify before preparing a candidate. No local verification bypass is supported.`,
    );
  // One current attempt only. A partial rerun is deliberately insufficient; dispatch a full Verify.
  const jobs = githubJson<{ jobs: { name: string; conclusion: string | null }[] }>(
    `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  ).jobs;
  assertSourceWorkflow(run, sourceCommit, branch, jobs);
  const name = `verified-source-packages-attempt-${run.run_attempt}`;
  const artifacts = githubJson<{
    artifacts: { id: number; name: string; expired: boolean; digest: string }[];
  }>(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`).artifacts.filter(
    (artifact) => artifact.name === name && !artifact.expired,
  );
  if (artifacts.length !== 1)
    throw new Error(
      "Full source certification has no unique unexpired verified package artifact. Dispatch full Verify to renew evidence.",
    );
  if (
    !Number.isSafeInteger(artifacts[0]!.id) ||
    artifacts[0]!.id <= 0 ||
    !/^sha256:[0-9a-f]{64}$/.test(artifacts[0]!.digest)
  )
    throw new Error("Verified package artifact has invalid immutable identity metadata.");
  execFileSync(
    "gh",
    ["run", "download", String(run.id), "--repo", repository, "--name", name, "--dir", destination],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const packages = await inspectReleasePackages(destination);
  const evidence = JSON.parse(
    await readFile(resolve(destination, "source-verification.json"), "utf8"),
  ) as SourceVerificationEvidence;
  assertSourceEvidence(evidence, run, packages);
  return {
    packages,
    runId: run.id,
    runAttempt: run.run_attempt,
    artifactId: artifacts[0]!.id,
    artifactDigest: artifacts[0]!.digest,
    url: run.html_url,
  };
}
