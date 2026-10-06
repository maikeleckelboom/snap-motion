import { expect, it } from "vitest";

import {
  assertSourceEvidence,
  assertSourceWorkflow,
  sourceVerificationJobs,
  type SourceWorkflowRun,
} from "./sourceVerification.ts";

const run: SourceWorkflowRun = {
  id: 123,
  run_attempt: 1,
  head_sha: "a".repeat(40),
  head_branch: "dev",
  event: "push",
  path: ".github/workflows/verify.yml",
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/maikeleckelboom/snap-motion/actions/runs/123",
};
const jobs = sourceVerificationJobs.map((name) => ({ name, conclusion: "success" }));
it("requires every source owner at the exact SHA", () => {
  expect(() => assertSourceWorkflow(run, run.head_sha, "dev", jobs)).not.toThrow();
  expect(() => assertSourceWorkflow(run, "b".repeat(40), "dev", jobs)).toThrow(
    /Candidate source|Downloaded source evidence/,
  );
  expect(() => assertSourceWorkflow(run, run.head_sha, "main", jobs)).toThrow(
    /Candidate source|Downloaded source evidence/,
  );
});
it.each(sourceVerificationJobs)(
  "rejects skipped, failed, missing and duplicate %s ownership",
  (owner) => {
    expect(() =>
      assertSourceWorkflow(
        run,
        run.head_sha,
        "dev",
        jobs.filter((job) => job.name !== owner),
      ),
    ).toThrow(/Candidate source|Downloaded source evidence/);
    for (const conclusion of ["skipped", "failure", null])
      expect(() =>
        assertSourceWorkflow(
          run,
          run.head_sha,
          "dev",
          jobs.map((job) => (job.name === owner ? { ...job, conclusion } : job)),
        ),
      ).toThrow(/Candidate source|Downloaded source evidence/);
    expect(() =>
      assertSourceWorkflow(run, run.head_sha, "dev", [
        ...jobs,
        { name: owner, conclusion: "success" },
      ]),
    ).toThrow(/Candidate source|Downloaded source evidence/);
  },
);
it.each([
  { event: "pull_request" },
  { path: ".github/workflows/fake.yml" },
  { conclusion: "failure" },
  { status: "in_progress" },
  { id: 0 },
  { run_attempt: 0 },
])("rejects nonauthoritative run metadata: %j", (change) => {
  expect(() => assertSourceWorkflow({ ...run, ...change }, run.head_sha, "dev", jobs)).toThrow(
    /Candidate source|Downloaded source evidence/,
  );
});
it("binds downloaded archive hashes, metadata, repository, attempt and commit to the run", () => {
  const evidence = {
    schemaVersion: 1 as const,
    repository: "maikeleckelboom/snap-motion",
    sourceCommit: run.head_sha,
    runId: run.id,
    runAttempt: 1,
    packages: [],
  };
  expect(() => assertSourceEvidence(evidence, run, [])).not.toThrow();
  for (const change of [
    { repository: "attacker/repo" },
    { sourceCommit: "b".repeat(40) },
    { runId: 124 },
    { runAttempt: 2 },
    { packages: [{ sha256: "forged" }] },
  ]) {
    expect(() =>
      assertSourceEvidence({ ...evidence, ...change } as typeof evidence, run, []),
    ).toThrow(/Candidate source|Downloaded source evidence/);
  }
});
