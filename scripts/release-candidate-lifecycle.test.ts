import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertAttachedSourceBranch,
  assertCandidateEligible,
  finalizeNewCandidate,
  pendingChangesets,
  type CandidateHistoryEntry,
  type CandidatePackageVersion,
} from "./release-candidate-lifecycle.ts";
import type { ReleasePackageAuthority } from "./release-package-assembly.ts";

const temporaryDirectories: string[] = [];

const fixturePackage: ReleasePackageAuthority = {
  name: "@snap-motion/core",
  version: "1.0.0-beta.1",
  file: "snap-motion-core-1.0.0-beta.1.tgz",
  bytes: 15,
  sha256: "a".repeat(64),
  private: true,
  sideEffects: false,
  exports: ["."],
  dependencies: {},
  peerDependencies: {},
};

function git(repository: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const beta9: readonly CandidatePackageVersion[] = [
  { name: "@snap-motion/core", version: "0.1.0-beta.9" },
  { name: "@snap-motion/vue", version: "0.1.0-beta.9" },
];
const history: readonly CandidateHistoryEntry[] = [
  { file: "config/release-candidates/0.1.0-beta.9.json", packages: beta9 },
];
const unrecordedVersion = "0.1.0-beta.next";

describe("release candidate lifecycle", () => {
  it("requires an attached source branch before candidate preparation", async () => {
    const repository = await mkdtemp(join(tmpdir(), "snap-motion-branch-authority-"));
    temporaryDirectories.push(repository);
    git(repository, "init");
    git(repository, "config", "user.name", "Snap Motion tests");
    git(repository, "config", "user.email", "snap-motion-tests@example.invalid");
    await writeFile(resolve(repository, "README.md"), "fixture\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "attached source");

    const attachedBranch = git(repository, "branch", "--show-current");
    expect(assertAttachedSourceBranch(attachedBranch)).toBe(attachedBranch);

    git(repository, "checkout", "--detach", "HEAD");
    const detachedBranch = git(repository, "branch", "--show-current");
    expect(detachedBranch).toBe("");
    expect(() => assertAttachedSourceBranch(detachedBranch)).toThrow(
      /requires an attached source branch so provenance is explicit/,
    );
  });

  it("reports pending package intent when an archived version would be reused", () => {
    expect(() =>
      assertCandidateEligible(beta9, history, [
        { name: "coverflow-pointer-focus", packages: ["@snap-motion/core", "@snap-motion/vue"] },
      ]),
    ).toThrow(/Pending release intent .* has advanced beyond the current package version/);
  });

  it("blocks archived-version reuse even when an engineer forgot a Changeset", () => {
    expect(() => assertCandidateEligible(beta9, history, [])).toThrow(
      /Existing immutable prerelease versions may not be reused/,
    );
  });

  it("allows the next aligned version after Changesets versioning", () => {
    expect(
      assertCandidateEligible(
        beta9.map(({ name }) => ({ name, version: unrecordedVersion })),
        history,
        [],
      ),
    ).toBe(unrecordedVersion);
  });

  it("does not require release intent for documentation-only work before first certification", () => {
    const firstCandidate = beta9.map(({ name }) => ({ name, version: unrecordedVersion }));
    expect(assertCandidateEligible(firstCandidate, history, [])).toBe(unrecordedVersion);
  });

  it("keeps inspection separate from candidate regeneration", () => {
    expect(history[0]?.packages).toEqual(beta9);
    expect(() => assertCandidateEligible(beta9, history, [])).toThrow(
      /Inspect the archived producer manifest instead of regenerating/,
    );
  });

  it("fails closed when Core and Vue versions diverge", () => {
    expect(() =>
      assertCandidateEligible(
        [beta9[0]!, { name: "@snap-motion/vue", version: unrecordedVersion }],
        history,
        [],
      ),
    ).toThrow(/Core and Vue candidate versions must remain aligned/);
  });

  it("distinguishes new Changesets from prerelease state that has already consumed them", () => {
    const sources = {
      "beta-nine-closure": '---\n"@snap-motion/vue": minor\n---\n\nOld intent.\n',
      "coverflow-pointer-focus":
        '---\n"@snap-motion/core": minor\n"@snap-motion/vue": minor\n---\n\nNew intent.\n',
    };

    expect(pendingChangesets(sources, ["beta-nine-closure"])).toEqual([
      {
        name: "coverflow-pointer-focus",
        packages: ["@snap-motion/core", "@snap-motion/vue"],
      },
    ]);
  });

  it("writes a new producer record once and materializes its package and release output", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-motion-prepare-"));
    temporaryDirectories.push(root);
    const artifactsRoot = resolve(root, ".artifacts");
    const sourcePackages = resolve(artifactsRoot, "packages");
    const candidateRecord = resolve(root, "config/release-candidates/1.0.0-beta.1.json");
    await Promise.all([
      mkdir(sourcePackages, { recursive: true }),
      mkdir(resolve(root, "config/release-candidates"), { recursive: true }),
    ]);
    await writeFile(resolve(sourcePackages, fixturePackage.file), "candidate-bytes");
    const recordSource = '{"candidate":"1.0.0-beta.1"}\n';

    await finalizeNewCandidate({
      artifactsRoot,
      candidateRecord,
      packageSourceDirectory: sourcePackages,
      packages: [fixturePackage],
      recordSource,
    });

    expect(await readFile(candidateRecord, "utf8")).toBe(recordSource);
    expect(await readFile(resolve(artifactsRoot, "packages", fixturePackage.file), "utf8")).toBe(
      "candidate-bytes",
    );
    expect(await readFile(resolve(artifactsRoot, "release/release-manifest.json"), "utf8")).toBe(
      recordSource,
    );
    await expect(stat(resolve(artifactsRoot, "release/SHA256SUMS"))).resolves.toBeDefined();
  });

  it("rejects a duplicate producer before replacing existing record or artifact bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-motion-duplicate-"));
    temporaryDirectories.push(root);
    const sourcePackages = resolve(root, "source-packages");
    const artifactsRoot = resolve(root, ".artifacts");
    const candidateRecord = resolve(root, "config/release-candidates/1.0.0-beta.1.json");
    await Promise.all([
      mkdir(sourcePackages, { recursive: true }),
      mkdir(resolve(root, "config/release-candidates"), { recursive: true }),
      mkdir(resolve(artifactsRoot, "release"), { recursive: true }),
    ]);
    await writeFile(resolve(sourcePackages, fixturePackage.file), "different-candidate-bytes");
    await writeFile(candidateRecord, "immutable-record\n");
    await writeFile(resolve(artifactsRoot, "release/sentinel"), "preserve-me");

    await expect(
      finalizeNewCandidate({
        artifactsRoot,
        candidateRecord,
        packageSourceDirectory: sourcePackages,
        packages: [fixturePackage],
        recordSource: "replacement-record\n",
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(candidateRecord, "utf8")).toBe("immutable-record\n");
    expect(await readFile(resolve(artifactsRoot, "release/sentinel"), "utf8")).toBe("preserve-me");
  });
});
