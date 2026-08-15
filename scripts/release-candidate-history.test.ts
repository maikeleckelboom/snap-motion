import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertReleaseCandidateHistory } from "./release-candidate-history.ts";

const repositories: string[] = [];

function git(repository: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd: repository, stdio: "pipe" });
}

async function repositoryWithRecordedCandidate(): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), "snap-motion-history-"));
  repositories.push(repository);
  git(repository, "init");
  git(repository, "config", "user.name", "Snap Motion tests");
  git(repository, "config", "user.email", "snap-motion-tests@example.invalid");
  await writeFile(resolve(repository, "README.md"), "fixture\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-m", "initial fixture");
  await mkdir(resolve(repository, "config/release-candidates"), { recursive: true });
  await writeFile(
    resolve(repository, "config/release-candidates/1.0.0-beta.1.json"),
    '{"version":"1.0.0-beta.1"}\n',
  );
  git(repository, "add", "config/release-candidates/1.0.0-beta.1.json");
  git(repository, "commit", "-m", "record candidate");
  return repository;
}

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repository) => rm(repository, { recursive: true })),
  );
});

describe("append-only release-candidate history", () => {
  it("allows adding a new candidate record", async () => {
    const repository = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.2.json"),
      '{"version":"1.0.0-beta.2"}\n',
    );
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");
    git(repository, "commit", "-m", "record next candidate");

    expect(() => assertReleaseCandidateHistory(repository)).not.toThrow();
  });

  it("rejects modification of an existing record", async () => {
    const repository = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.1.json"),
      '{"version":"tampered"}\n',
    );
    git(repository, "add", "config/release-candidates/1.0.0-beta.1.json");
    git(repository, "commit", "-m", "tamper candidate");

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/modified/);
  });

  it("rejects deletion of an existing record", async () => {
    const repository = await repositoryWithRecordedCandidate();
    git(repository, "rm", "config/release-candidates/1.0.0-beta.1.json");
    git(repository, "commit", "-m", "delete candidate");

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/deleted/);
  });

  it("rejects rename of an existing record", async () => {
    const repository = await repositoryWithRecordedCandidate();
    git(
      repository,
      "mv",
      "config/release-candidates/1.0.0-beta.1.json",
      "config/release-candidates/renamed.json",
    );
    git(repository, "commit", "-m", "rename candidate");

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/renamed or replaced/);
  });

  it("rejects an uncommitted rewrite in an ordinary local verification", async () => {
    const repository = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.1.json"),
      '{"version":"working-tree-tamper"}\n',
    );

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/working tree modified/);
  });
});
