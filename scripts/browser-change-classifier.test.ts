import { describe, expect, it } from "vitest";

import {
  classifyChangedPaths,
  classifyGitRange,
  classifyGitHubEvent,
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

  it("classifies the historical 9fc0595...a4e02d8 release-only path set as irrelevant", () => {
    expect(
      classifyChangedPaths([
        "scripts/check-release-candidate-history.ts",
        "scripts/release-candidate-history.test.ts",
        "scripts/release-candidate-history.ts",
        "scripts/release-candidate-lifecycle.test.ts",
        "scripts/release-candidate-lifecycle.ts",
        "scripts/release-candidate.ts",
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
    expect(commands).toContain(`diff --name-only --diff-filter=ACDMRTUXB ${sha("c")} ${sha("b")}`);
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
