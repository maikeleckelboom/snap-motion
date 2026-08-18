import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";
import {
  assertPackageAuthorityMatches,
  serializeCandidateRecord,
  type CandidateRecord,
} from "./release-candidate-record.ts";
import { verifyRecordedCandidate } from "./release-candidate-verifier.ts";
import {
  inspectReleasePackages,
  packReleasePackages,
  type ReleasePackageAuthority,
} from "./release-package-assembly.ts";

const temporaryRepositories: string[] = [];
const version = "1.0.0-beta.1";

function git(repository: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createPackage(
  repository: string,
  directory: "core" | "vue",
  name: string,
  source: string,
): Promise<void> {
  const packageRoot = resolve(repository, `packages/${directory}`);
  await mkdir(resolve(packageRoot, "dist"), { recursive: true });
  await writeJson(resolve(packageRoot, "package.json"), {
    name,
    version,
    private: true,
    type: "module",
    files: ["dist"],
    exports: { ".": "./dist/index.js" },
    sideEffects: false,
  });
  await writeFile(resolve(packageRoot, "dist/index.js"), source);
}

async function createSourceRepository(): Promise<{ repository: string; sourceCommit: string }> {
  const repository = await mkdtemp(join(tmpdir(), "snap-motion-verifier-"));
  temporaryRepositories.push(repository);
  git(repository, "init");
  git(repository, "config", "user.name", "Snap Motion tests");
  git(repository, "config", "user.email", "snap-motion-tests@example.invalid");
  await writeJson(resolve(repository, "package.json"), {
    name: "release-candidate-fixture",
    private: true,
    type: "module",
    packageManager: "pnpm@11.13.1",
    scripts: { "build:packages": 'node -e ""' },
  });
  await writeFile(resolve(repository, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  await writeFile(
    resolve(repository, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n  .: {}\n  packages/core: {}\n  packages/vue: {}\n",
  );
  await writeFile(resolve(repository, ".gitignore"), "node_modules/\n.artifacts/\n");
  await writeFile(resolve(repository, ".gitattributes"), "* text=auto eol=lf\n");
  await createPackage(repository, "core", "@snap-motion/core", 'export const source = "S";\n');
  await createPackage(repository, "vue", "@snap-motion/vue", 'export const source = "S";\n');
  git(repository, "add", ".");
  git(repository, "commit", "-m", "source S");
  return { repository, sourceCommit: git(repository, "rev-parse", "HEAD") };
}

async function assembleRecord(repository: string, sourceCommit: string): Promise<string> {
  const pnpm = resolveRepositoryPnpm(repository);
  runPnpmSync(pnpm, ["install", "--frozen-lockfile"], { cwd: repository });
  const packageDirectory = resolve(repository, ".artifacts/packages");
  await packReleasePackages(repository, packageDirectory);
  const assembledPackages = await inspectReleasePackages(packageDirectory);
  const record: CandidateRecord = {
    schemaVersion: 1,
    createdAt: git(repository, "show", "-s", "--format=%cI", sourceCommit),
    source: {
      repository: "https://example.invalid/snap-motion-fixture",
      visibility: "private",
      branch: git(repository, "branch", "--show-current"),
      commit: sourceCommit,
    },
    verification: { command: "pnpm release:check", passed: true },
    packages: assembledPackages,
    private: true,
    published: false,
    intendedDistTag: "beta",
    blockers: [],
  };
  return serializeCandidateRecord(record);
}

async function writeRecord(repository: string, source: string): Promise<string> {
  const recordDirectory = resolve(repository, "config/release-candidates");
  await mkdir(recordDirectory, { recursive: true });
  const recordPath = resolve(recordDirectory, `${version}.json`);
  await writeFile(recordPath, source);
  return recordPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories
      .splice(0)
      .map((repository) => rm(repository, { force: true, recursive: true })),
  );
});

describe("recorded release-candidate verification", () => {
  it("fails precisely when the selected candidate has no producer record", async () => {
    const { repository } = await createSourceRepository();

    await expect(verifyRecordedCandidate(repository, "1.0.0-beta.2")).rejects.toThrow(
      /has no committed producer record.*release:candidate:prepare/s,
    );
  });

  it("recovers missing artifacts at provenance commit P from source S and ignores later same-version source", async () => {
    const { repository, sourceCommit } = await createSourceRepository();
    const recordSource = await assembleRecord(repository, sourceCommit);
    const recordPath = await writeRecord(repository, recordSource);
    git(repository, "add", `config/release-candidates/${version}.json`);
    git(repository, "commit", "-m", "provenance record P");

    await writeFile(
      resolve(repository, "packages/core/dist/index.js"),
      'export const source = "later-same-version-bytes";\n',
    );
    git(repository, "add", "packages/core/dist/index.js");
    git(repository, "commit", "-m", "later source with occupied version");
    await rm(resolve(repository, ".artifacts/packages"), { force: true, recursive: true });
    await mkdir(resolve(repository, ".artifacts/release"), { recursive: true });
    await writeFile(resolve(repository, ".artifacts/release/partial"), "interrupted");

    const secondVerification = await verifyRecordedCandidate(repository, version);
    expect(secondVerification.sourceCommit).toBe(sourceCommit);
    expect(await readFile(recordPath, "utf8")).toBe(recordSource);
    expect(
      await readFile(resolve(repository, ".artifacts/release/release-manifest.json"), "utf8"),
    ).toBe(recordSource);
    await expect(readFile(resolve(repository, ".artifacts/release/partial"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    const recorded = JSON.parse(recordSource) as CandidateRecord;
    const recovered = await inspectReleasePackages(resolve(repository, ".artifacts/packages"));
    expect(recovered).toEqual(recorded.packages);
    expect(git(repository, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(
      1,
    );
  }, 120_000);

  it("hard-fails a package-authority mismatch directly", () => {
    const recorded: ReleasePackageAuthority = {
      name: "@snap-motion/core",
      version,
      file: `snap-motion-core-${version}.tgz`,
      bytes: 128,
      sha256: "a".repeat(64),
      private: true,
      sideEffects: false,
      exports: ["."],
      dependencies: {},
      peerDependencies: {},
    };

    expect(() =>
      assertPackageAuthorityMatches([recorded], [{ ...recorded, sha256: "b".repeat(64) }]),
    ).toThrow(/package authority does not match/);
  });
});
