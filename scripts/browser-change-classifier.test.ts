import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyChangedPaths,
  classifyGitRange,
  classifyGitHubEvent,
  repositoryGitCommand,
  type GitCommand,
} from "./browser-change-classifier.ts";

const sha = (character: string) => character.repeat(40);

function gitForDiff(paths: readonly string[], mergeBase = sha("c")): GitCommand {
  return (arguments_) => {
    if (arguments_[0] === "cat-file") return "";
    if (arguments_[0] === "merge-base") return `${mergeBase}\n`;
    if (arguments_[0] === "diff") return `${paths.join("\n")}${paths.length > 0 ? "\n" : ""}`;
    throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
  };
}

interface GitFixture {
  readonly base: string;
  readonly head: string;
  readonly repositoryRoot: string;
}

function git(repositoryRoot: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeFixtureFile(repositoryRoot: string, path: string, contents: string): void {
  const absolutePath = join(repositoryRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function createGitFixture(options: {
  readonly beforePath: string;
  readonly afterPath: string;
}): GitFixture {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "snap-motion-browser-classifier-"));
  git(repositoryRoot, "init", "--quiet");
  git(repositoryRoot, "config", "user.email", "classifier@example.test");
  git(repositoryRoot, "config", "user.name", "Browser Classifier Test");
  writeFixtureFile(repositoryRoot, options.beforePath, "fixture authority\n");
  git(repositoryRoot, "add", ".");
  git(repositoryRoot, "commit", "--quiet", "--message", "fixture before");
  const base = git(repositoryRoot, "rev-parse", "HEAD").trim();

  const afterAbsolutePath = join(repositoryRoot, options.afterPath);
  mkdirSync(dirname(afterAbsolutePath), { recursive: true });
  renameSync(join(repositoryRoot, options.beforePath), afterAbsolutePath);

  git(repositoryRoot, "add", "--all");
  git(repositoryRoot, "commit", "--quiet", "--message", "fixture after");
  const head = git(repositoryRoot, "rev-parse", "HEAD").trim();
  return { base, head, repositoryRoot };
}

function classifyGitFixture(options: Parameters<typeof createGitFixture>[0]) {
  const fixture = createGitFixture(options);
  try {
    return classifyGitRange(
      fixture.base,
      fixture.head,
      repositoryGitCommand(fixture.repositoryRoot),
    );
  } finally {
    rmSync(fixture.repositoryRoot, { recursive: true, force: true });
  }
}

const cheap = {
  packageAuthorityRequired: false,
  linuxVerificationRequired: false,
  windowsPortabilityRequired: false,
  browserRequired: false,
  packageIntegrationRequired: false,
  fullSourceCertification: false,
};
const full = {
  packageAuthorityRequired: true,
  linuxVerificationRequired: true,
  windowsPortabilityRequired: true,
  browserRequired: true,
  packageIntegrationRequired: true,
  fullSourceCertification: true,
};
// Linux (and therefore the package authority it consumes) only.
const linuxOnly = { ...cheap, packageAuthorityRequired: true, linuxVerificationRequired: true };

describe("verification ownership by path class", () => {
  it.each([
    ["documentation", ["docs/geometry.md", "README.md"]],
    ["release documentation", ["docs/releasing.md"]],
    [
      "audit JSON and its documentation",
      ["docs/test-architecture-and-performance.md", "config/test-performance-after.json"],
    ],
    ["audit JSON only", ["config/test-performance-before.json"]],
    ["candidate record only", ["config/release-candidates/0.1.0-beta.15.json"]],
    ["changeset only", [".changeset/quiet-gallery.md"]],
    [
      "docs with record and changeset",
      ["docs/a.md", ".changeset/b.md", "config/release-candidates/1.json"],
    ],
  ])("requires no heavy owner for %s", (_label, paths) => {
    expect(classifyChangedPaths(paths)).toMatchObject(cheap);
    expect(classifyChangedPaths(paths).reason).toMatch(/metadata/);
  });

  it.each([
    "scripts/release-candidate-history.ts",
    "scripts/release-candidate-record.ts",
    "scripts/release-candidate-verifier.test.ts",
    "scripts/sourceVerification.ts",
    "scripts/sourceVerificationRecord.test.ts",
    "config/release-blockers.json",
    ".github/workflows/release-candidate.yml",
  ])("runs only Linux tooling verification for %s", (path) => {
    expect(classifyChangedPaths([path])).toMatchObject(linuxOnly);
  });

  it.each([
    "scripts/pnpm-cli.test.ts",
    "scripts/release-package-assembly.test.ts",
    "scripts/verify-packages.ts",
  ])("adds Windows portability without integration for %s", (path) => {
    expect(classifyChangedPaths([path])).toMatchObject({
      ...linuxOnly,
      windowsPortabilityRequired: true,
      browserRequired: false,
      packageIntegrationRequired: false,
    });
  });

  it.each([
    "scripts/release-package-assembly.ts",
    "scripts/pack-packages.ts",
    "scripts/pnpm-cli.ts",
    "scripts/packedArchive.ts",
  ])("requires authority, Linux, Windows and integration for package assembly %s", (path) => {
    expect(classifyChangedPaths([path])).toMatchObject({
      ...linuxOnly,
      windowsPortabilityRequired: true,
      packageIntegrationRequired: true,
      browserRequired: false,
      fullSourceCertification: false,
    });
  });

  it.each([
    "scripts/verifyPackagesBrowser.ts",
    "scripts/certifySurfacePreferences.ts",
    "e2e/media-preview.spec.ts",
    "e2e/playground-preview.spec.ts",
    "fixture-e2e/router.spec.ts",
    "fixtures/packed-consumers/package.template.json",
  ])("requires integration with its Linux static owners for %s", (path) => {
    expect(classifyChangedPaths([path])).toMatchObject({
      ...linuxOnly,
      packageIntegrationRequired: true,
      windowsPortabilityRequired: false,
      browserRequired: false,
    });
  });

  it.each(["e2e/stacked-deck.spec.ts", "e2e/helpers.ts"])(
    "keeps lab-only E2E %s out of packed certification and Windows",
    (path) => {
      expect(classifyChangedPaths([path])).toMatchObject({
        ...linuxOnly,
        browserRequired: true,
        packageIntegrationRequired: false,
        windowsPortabilityRequired: false,
      });
    },
  );

  it.each([
    ["Core source", "packages/core/src/math.ts"],
    ["Vue source", "packages/vue/src/media-gallery/use-media-gallery.ts"],
    ["Vue component", "packages/vue/src/MediaGalleryDialog.vue"],
    ["package manifest", "packages/core/package.json"],
    ["shared CSS", "shared.css"],
    ["lab", "apps/lab/src/App.vue"],
    ["lockfile", "pnpm-lock.yaml"],
    ["root manifest", "package.json"],
    ["Playwright config", "playwright.config.ts"],
    ["Verify workflow", ".github/workflows/verify.yml"],
    ["classifier itself", "scripts/classify-browser-change.ts"],
    ["certification gate", "scripts/certifyBrowser.ts"],
    ["other config", "config/test-performance-selection.json"],
    ["other changeset file", ".changeset/config.json"],
    ["unknown path", "future/new-authority.toml"],
    ["nested non-doc Markdown", "apps/lab/NOTES.md"],
  ])("fails closed to every owner for %s", (_label, path) => {
    expect(classifyChangedPaths([path])).toMatchObject(full);
  });

  it("treats packaged Markdown as package input but never as browser input", () => {
    expect(classifyChangedPaths(["packages/vue/README.md"])).toMatchObject({
      ...linuxOnly,
      windowsPortabilityRequired: true,
      browserRequired: false,
      packageIntegrationRequired: false,
    });
  });

  it("fails closed for an empty path set", () => {
    expect(classifyChangedPaths([])).toMatchObject(full);
  });

  it("normalizes Windows and dot-relative spellings before classifying", () => {
    expect(
      classifyChangedPaths([".\\docs\\a.md", "./config/test-performance-after.json"]),
    ).toMatchObject(cheap);
    expect(classifyChangedPaths(["packages\\core\\src\\math.ts"])).toMatchObject(full);
  });

  it("does not let lookalike paths borrow a safe class", () => {
    for (const path of [
      "docs/a.md.js",
      "docs/script.ts",
      "config/release-candidates/nested/x.json",
      "config/release-candidates/x.js",
      "config/test-performance-after.json.bak",
      "scripts/release-candidate-history.ts.bak",
      ".changeset/pre.json",
    ])
      expect(classifyChangedPaths([path])).toMatchObject(full);
  });
});

describe("mixed changes take the union", () => {
  it("never lets cheap files downgrade runtime files", () => {
    expect(
      classifyChangedPaths(["docs/gallery.md", "packages/vue/src/MediaGalleryDialog.vue"]),
    ).toMatchObject(full);
    expect(
      classifyChangedPaths(["config/test-performance-after.json", "e2e/sheet.spec.ts"]),
    ).toMatchObject({ ...linuxOnly, browserRequired: true });
  });
  it("unions a candidate record with package assembly", () => {
    expect(
      classifyChangedPaths([
        "config/release-candidates/0.1.0-beta.15.json",
        "scripts/release-package-assembly.ts",
      ]),
    ).toMatchObject({
      ...linuxOnly,
      windowsPortabilityRequired: true,
      packageIntegrationRequired: true,
    });
  });
  it("assembles full certification only from every owner", () => {
    expect(
      classifyChangedPaths(["e2e/sheet.spec.ts", "scripts/pack-packages.ts", "docs/geometry.md"]),
    ).toMatchObject({
      browserRequired: true,
      packageIntegrationRequired: true,
      windowsPortabilityRequired: true,
      fullSourceCertification: true,
    });
    expect(
      classifyChangedPaths(["e2e/sheet.spec.ts", "scripts/release-candidate.ts"]),
    ).toMatchObject({ fullSourceCertification: false, windowsPortabilityRequired: false });
  });
  it("reports the paths that triggered each owner", () => {
    const result = classifyChangedPaths(["docs/a.md", "scripts/pnpm-cli.test.ts", "e2e/a.spec.ts"]);
    expect(result.triggers.windowsPortabilityRequired).toEqual(["scripts/pnpm-cli.test.ts"]);
    expect(result.triggers.browserRequired).toEqual(["e2e/a.spec.ts"]);
    expect(result.triggers.linuxVerificationRequired).toEqual([
      "scripts/pnpm-cli.test.ts",
      "e2e/a.spec.ts",
    ]);
    expect(result.reason).toMatch(/Linux verification.*Windows portability.*Source browsers/);
  });
  it("maintains owner dependencies for every classified single path", () => {
    for (const path of ["docs/a.md", "e2e/a.spec.ts", "scripts/pack-packages.ts", "x/unknown.ts"]) {
      const r = classifyChangedPaths([path]);
      expect(r.packageAuthorityRequired).toBe(r.linuxVerificationRequired);
      expect(
        r.linuxVerificationRequired || !(r.browserRequired || r.packageIntegrationRequired),
      ).toBe(true);
    }
  });
});

describe("GitHub event change authority", () => {
  it("classifies an explicit Git range from its changed paths", () => {
    const result = classifyGitRange(sha("a"), sha("b"), gitForDiff(["docs/releasing.md"]));
    expect(result.browserRequired).toBe(false);
    expect(result.changedPaths).toEqual(["docs/releasing.md"]);
  });

  it("fails closed when an explicit Git range is invalid or unavailable", () => {
    expect(classifyGitRange(sha("0"), sha("b"), gitForDiff(["README.md"])).browserRequired).toBe(
      true,
    );
    expect(
      classifyGitRange(sha("a"), sha("b"), () => {
        throw new Error("commit unavailable");
      }).browserRequired,
    ).toBe(true);
  });

  it("classifies an ordinary push from its Git diff", () => {
    const result = classifyGitHubEvent({
      eventName: "push",
      eventPayload: { before: sha("a"), after: sha("b") },
      git: gitForDiff(["README.md"]),
    });
    expect(result.browserRequired).toBe(false);
    expect(result.changedPaths).toEqual(["README.md"]);
  });

  it("classifies a pull request from the merge base through its head", () => {
    const commands: string[] = [];
    const delegate = gitForDiff(["packages/vue/src/index.ts"]);
    const result = classifyGitHubEvent({
      eventName: "pull_request",
      eventPayload: {
        pull_request: { base: { sha: sha("a") }, head: { sha: sha("b") } },
      },
      git(arguments_) {
        commands.push(arguments_.join(" "));
        return delegate(arguments_);
      },
    });
    expect(result.browserRequired).toBe(true);
    expect(commands).toContain(`merge-base ${sha("a")} ${sha("b")}`);
    expect(commands).toContain(
      `diff --no-renames --name-only --diff-filter=ACDMRTUXB ${sha("c")} ${sha("b")}`,
    );
  });

  it("requires browser certification for workflow dispatch without reading Git", () => {
    const result = classifyGitHubEvent({
      eventName: "workflow_dispatch",
      eventPayload: {},
      git: () => {
        throw new Error("Git must not run");
      },
    });
    expect(result.browserRequired).toBe(true);
    expect(result.reason).toMatch(/manual workflow dispatch/);
  });

  it.each([
    ["all-zero previous SHA", "push", { before: sha("0"), after: sha("b") }],
    ["missing push base", "push", { after: sha("b") }],
    ["invalid pull request", "pull_request", { pull_request: {} }],
    ["unexpected event", "schedule", {}],
  ])("fails closed for %s", (_label, eventName, eventPayload) => {
    expect(
      classifyGitHubEvent({ eventName, eventPayload, git: gitForDiff(["README.md"]) })
        .browserRequired,
    ).toBe(true);
  });

  it("fails closed when a pull-request merge base is unavailable", () => {
    const result = classifyGitHubEvent({
      eventName: "pull_request",
      eventPayload: {
        pull_request: { base: { sha: sha("a") }, head: { sha: sha("b") } },
      },
      git(arguments_) {
        if (arguments_[0] === "cat-file") return "";
        throw new Error("merge base unavailable");
      },
    });
    expect(result.browserRequired).toBe(true);
    expect(result.reason).toMatch(/merge base or diff could not be inspected/);
  });
});

describe("real Git rename classification", () => {
  it.each([
    ["Vue source to Markdown", "packages/vue/src/example.ts", "docs/example.md"],
    ["release documentation to Vue source", "docs/releasing.md", "packages/vue/src/example.ts"],
  ])("requires browsers for %s", (_label, beforePath, afterPath) => {
    const classification = classifyGitFixture({ beforePath, afterPath });
    expect(classification.browserRequired).toBe(true);
    expect(classification.changedPaths).toHaveLength(2);
    expect(classification.changedPaths).toEqual(expect.arrayContaining([beforePath, afterPath]));
  });

  it("keeps an irrelevant Markdown rename browser-irrelevant", () => {
    const classification = classifyGitFixture({
      beforePath: "docs/old.md",
      afterPath: "docs/new.md",
    });
    expect(classification.browserRequired).toBe(false);
    expect(classification.changedPaths).toHaveLength(2);
    expect(classification.changedPaths).toEqual(
      expect.arrayContaining(["docs/old.md", "docs/new.md"]),
    );
  });
});

describe("every unprovable change scope requires the full source matrix", () => {
  const everything = {
    packageAuthorityRequired: true,
    linuxVerificationRequired: true,
    windowsPortabilityRequired: true,
    browserRequired: true,
    packageIntegrationRequired: true,
    fullSourceCertification: true,
  };
  it("covers invalid, missing and uninspectable Git diffs", () => {
    expect(classifyGitRange(sha("0"), sha("b"), gitForDiff(["README.md"]))).toMatchObject(
      everything,
    );
    expect(classifyGitRange("main", sha("b"), gitForDiff(["README.md"]))).toMatchObject(everything);
    expect(
      classifyGitRange(sha("a"), sha("b"), () => {
        throw new Error("commit unavailable");
      }),
    ).toMatchObject(everything);
    expect(classifyGitRange(sha("a"), sha("b"), gitForDiff([]))).toMatchObject(everything);
  });
  it("covers manual workflow dispatch, unknown events and missing push SHAs", () => {
    const gitCommand = gitForDiff(["README.md"]);
    for (const event of [
      { eventName: "workflow_dispatch", eventPayload: {} },
      { eventName: "schedule", eventPayload: {} },
      { eventName: undefined, eventPayload: undefined },
      { eventName: "push", eventPayload: { after: sha("b") } },
      { eventName: "pull_request", eventPayload: { pull_request: {} } },
    ])
      expect(classifyGitHubEvent({ ...event, git: gitCommand })).toMatchObject(everything);
  });
  it("lets a cheap push stay cheap and a runtime pull request take the full matrix", () => {
    expect(
      classifyGitHubEvent({
        eventName: "push",
        eventPayload: { before: sha("a"), after: sha("b") },
        git: gitForDiff([
          "docs/test-architecture-and-performance.md",
          "config/test-performance-after.json",
        ]),
      }),
    ).toMatchObject({
      packageAuthorityRequired: false,
      linuxVerificationRequired: false,
      windowsPortabilityRequired: false,
      browserRequired: false,
      packageIntegrationRequired: false,
      fullSourceCertification: false,
    });
    expect(
      classifyGitHubEvent({
        eventName: "pull_request",
        eventPayload: { pull_request: { base: { sha: sha("a") }, head: { sha: sha("b") } } },
        git: gitForDiff(["docs/a.md", "packages/vue/src/index.ts"]),
      }),
    ).toMatchObject(everything);
  });
});
