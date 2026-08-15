import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertReleaseCandidateHistory,
  assertReleaseCandidateRegistry,
} from "./release-candidate-history.ts";
import { serializeCandidateRecord, type CandidateRecord } from "./release-candidate-record.ts";
import type { ReleasePackageAuthority } from "./release-package-assembly.ts";

const repositories: string[] = [];

function git(repository: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

function candidatePackage(
  version: string,
  name = "@snap-motion/core",
  file = `snap-motion-core-${version}.tgz`,
): ReleasePackageAuthority {
  return {
    name,
    version,
    file,
    bytes: 42,
    sha256: "a".repeat(64),
    private: true,
    sideEffects: false,
    exports: ["."],
    dependencies: {},
    peerDependencies: {},
  };
}

function candidateRecord(version: string, sourceCommit: string): CandidateRecord {
  return {
    schemaVersion: 1,
    createdAt: "2026-08-16T00:00:00.000Z",
    source: {
      repository: "https://example.invalid/snap-motion-fixture",
      visibility: "private",
      branch: "fixture",
      commit: sourceCommit,
    },
    verification: { command: "pnpm release:check", passed: true },
    packages: [candidatePackage(version)],
    private: true,
    published: false,
    intendedDistTag: "beta",
    blockers: [],
  };
}

type MutableCandidateRecord = {
  schemaVersion?: unknown;
  source: Record<string, unknown>;
  packages: Record<string, unknown>[];
};

function mutableCandidateRecord(version: string, sourceCommit: string): MutableCandidateRecord {
  return JSON.parse(
    serializeCandidateRecord(candidateRecord(version, sourceCommit)),
  ) as MutableCandidateRecord;
}

async function writeRecord(
  repository: string,
  fileVersion: string,
  record: CandidateRecord | MutableCandidateRecord,
): Promise<string> {
  const directory = resolve(repository, "config/release-candidates");
  await mkdir(directory, { recursive: true });
  const recordPath = resolve(directory, `${fileVersion}.json`);
  const source =
    "schemaVersion" in record && record.schemaVersion === 1
      ? serializeCandidateRecord(record as CandidateRecord)
      : `${JSON.stringify(record, null, 2)}\n`;
  await writeFile(recordPath, source);
  return recordPath;
}

async function sourceRepository(): Promise<{ repository: string; sourceCommit: string }> {
  const repository = await mkdtemp(join(tmpdir(), "snap-motion-history-"));
  repositories.push(repository);
  git(repository, "init");
  git(repository, "config", "user.name", "Snap Motion tests");
  git(repository, "config", "user.email", "snap-motion-tests@example.invalid");
  await writeFile(resolve(repository, "README.md"), "fixture\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-m", "source S");
  return { repository, sourceCommit: git(repository, "rev-parse", "HEAD") };
}

async function repositoryWithRecordedCandidate(): Promise<{
  repository: string;
  sourceCommit: string;
}> {
  const { repository, sourceCommit } = await sourceRepository();
  await writeRecord(repository, "1.0.0-beta.1", candidateRecord("1.0.0-beta.1", sourceCommit));
  git(repository, "add", "config/release-candidates/1.0.0-beta.1.json");
  git(repository, "commit", "-m", "provenance P");
  return { repository, sourceCommit };
}

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repository) => rm(repository, { recursive: true })),
  );
});

describe("release-candidate registry admission", () => {
  it("admits a valid record added after its historical source commit", async () => {
    const { repository } = await repositoryWithRecordedCandidate();

    await expect(assertReleaseCandidateRegistry(repository)).resolves.toBeUndefined();
  });

  it("allows staging a new valid candidate record as an append-only addition", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    const sourceCommit = git(repository, "rev-parse", "HEAD");
    await writeRecord(repository, "1.0.0-beta.2", candidateRecord("1.0.0-beta.2", sourceCommit));
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    expect(git(repository, "status", "--short")).toMatch(/^A  /);
    await expect(assertReleaseCandidateRegistry(repository)).resolves.toBeUndefined();
  });

  it("rejects a malformed newly added record even while Git marks it as an addition", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.2.json"),
      '{"version":"1.0.0-beta.2"}\n',
    );
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    expect(git(repository, "status", "--short")).toMatch(/^A  /);
    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(/schemaVersion/);
  });

  it("rejects a filename and recorded package-version mismatch through the record authority", async () => {
    const { repository, sourceCommit } = await repositoryWithRecordedCandidate();
    await writeRecord(repository, "1.0.0-beta.2", candidateRecord("1.0.0-beta.3", sourceCommit));
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(
      /must be named 1\.0\.0-beta\.3\.json/,
    );
  });

  it("rejects an invalid package hash through the record authority", async () => {
    const { repository, sourceCommit } = await repositoryWithRecordedCandidate();
    const record = mutableCandidateRecord("1.0.0-beta.2", sourceCommit);
    record.packages[0]!.sha256 = "not-a-sha-256";
    await writeRecord(repository, "1.0.0-beta.2", record);
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(
      /expected a SHA-256 hash/,
    );
  });

  it("rejects a well-shaped source hash that does not resolve to a Git commit", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    const missingCommit = "f".repeat(40);
    await writeRecord(repository, "1.0.0-beta.2", candidateRecord("1.0.0-beta.2", missingCommit));
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(
      /does not resolve to a Git commit in this repository/,
    );
  });

  it.each([
    ["missing schema version", (record: MutableCandidateRecord) => delete record.schemaVersion],
    ["invalid schema version", (record: MutableCandidateRecord) => (record.schemaVersion = 2)],
    [
      "invalid source commit",
      (record: MutableCandidateRecord) => (record.source.commit = "not-a-commit"),
    ],
    [
      "empty source repository",
      (record: MutableCandidateRecord) => (record.source.repository = ""),
    ],
    [
      "empty source visibility",
      (record: MutableCandidateRecord) => (record.source.visibility = ""),
    ],
    ["empty source branch", (record: MutableCandidateRecord) => (record.source.branch = "")],
    [
      "duplicate package identity",
      (record: MutableCandidateRecord) =>
        record.packages.push({ ...record.packages[0]!, file: "snap-motion-duplicate.tgz" }),
    ],
    [
      "duplicate package archive name",
      (record: MutableCandidateRecord) =>
        record.packages.push({ ...record.packages[0]!, name: "@snap-motion/vue" }),
    ],
    [
      "misaligned package versions",
      (record: MutableCandidateRecord) =>
        record.packages.push({
          ...record.packages[0]!,
          name: "@snap-motion/vue",
          version: "1.0.0-beta.3",
          file: "snap-motion-vue-1.0.0-beta.3.tgz",
        }),
    ],
    [
      "invalid package authority shape",
      (record: MutableCandidateRecord) => (record.packages[0]!.bytes = -1),
    ],
  ])("rejects a newly added record with %s", async (_label, mutate) => {
    const { repository, sourceCommit } = await repositoryWithRecordedCandidate();
    const record = mutableCandidateRecord("1.0.0-beta.2", sourceCommit);
    mutate(record);
    await writeRecord(repository, "1.0.0-beta.2", record);
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");

    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(
      /Invalid candidate record|must remain aligned/,
    );
  });

  it("rejects a well-formed record that points to an unrelated Git commit", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    const tree = git(repository, "write-tree");
    const unrelatedCommit = git(repository, "commit-tree", tree, "-m", "unrelated source");
    await writeRecord(repository, "1.0.0-beta.2", candidateRecord("1.0.0-beta.2", unrelatedCommit));
    git(repository, "add", "config/release-candidates/1.0.0-beta.2.json");
    git(repository, "commit", "-m", "invalid provenance topology");

    expect(() => git(repository, "cat-file", "-e", `${unrelatedCommit}^{commit}`)).not.toThrow();
    await expect(assertReleaseCandidateRegistry(repository)).rejects.toThrow(
      /is not an ancestor of the current HEAD/,
    );
  });

  it("accepts source S through intervening commits, provenance P, and a later descendant", async () => {
    const { repository, sourceCommit } = await sourceRepository();
    await writeFile(resolve(repository, "normal-change.txt"), "between S and P\n");
    git(repository, "add", "normal-change.txt");
    git(repository, "commit", "-m", "normal intervening commit");
    await writeRecord(repository, "1.0.0-beta.1", candidateRecord("1.0.0-beta.1", sourceCommit));
    git(repository, "add", "config/release-candidates/1.0.0-beta.1.json");
    git(repository, "commit", "-m", "provenance P");
    await writeFile(resolve(repository, "later.txt"), "descendant of P\n");
    git(repository, "add", "later.txt");
    git(repository, "commit", "-m", "later descendant");

    expect(git(repository, "merge-base", "--is-ancestor", sourceCommit, "HEAD")).toBe("");
    await expect(assertReleaseCandidateRegistry(repository)).resolves.toBeUndefined();
  });
});

describe("append-only release-candidate history", () => {
  it("rejects modification of an existing record", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.1.json"),
      '{"version":"tampered"}\n',
    );
    git(repository, "add", "config/release-candidates/1.0.0-beta.1.json");
    git(repository, "commit", "-m", "tamper candidate");

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/modified/);
  });

  it("rejects deletion of an existing record", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
    git(repository, "rm", "config/release-candidates/1.0.0-beta.1.json");
    git(repository, "commit", "-m", "delete candidate");

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/deleted/);
  });

  it("rejects rename of an existing record", async () => {
    const { repository } = await repositoryWithRecordedCandidate();
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
    const { repository } = await repositoryWithRecordedCandidate();
    await writeFile(
      resolve(repository, "config/release-candidates/1.0.0-beta.1.json"),
      '{"version":"working-tree-tamper"}\n',
    );

    expect(() => assertReleaseCandidateHistory(repository)).toThrow(/working tree modified/);
  });
});
