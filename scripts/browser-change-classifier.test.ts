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

describe("browser changed-path classification", () => {
  it("skips browser certification for documentation-only changes", () => {
    expect(classifyChangedPaths(["README.md", "docs/releasing.md"]).browserRequired).toBe(false);
  });

  it("skips browser certification for release-candidate integrity-only changes", () => {
    expect(
      classifyChangedPaths([
        ".changeset/candidate.md",
        "config/release-candidates/0.1.0-beta.9.json",
        "config/release-blockers.json",
        "scripts/release-candidate-history.ts",
        "scripts/release-candidate-lifecycle.test.ts",
        ".github/workflows/release-candidate.yml",
      ]).browserRequired,
    ).toBe(false);
  });

  it.each([
    ["Core source", "packages/core/src/index.ts"],
    ["Vue source", "packages/vue/src/index.ts"],
    ["lab", "apps/lab/src/App.vue"],
    ["E2E test", "e2e/sheet.spec.ts"],
    ["Playwright config", "playwright.config.ts"],
    ["lockfile", "pnpm-lock.yaml"],
    ["root manifest", "package.json"],
    ["Verify workflow", ".github/workflows/verify.yml"],
    ["unknown path", "future/new-authority.toml"],
  ])("requires browser certification for %s changes", (_label, path) => {
    expect(classifyChangedPaths([path]).browserRequired).toBe(true);
  });

  it("fails closed for an empty path set", () => {
    expect(classifyChangedPaths([]).browserRequired).toBe(true);
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
