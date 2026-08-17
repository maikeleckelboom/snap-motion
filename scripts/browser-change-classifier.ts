import { execFileSync } from "node:child_process";

export interface BrowserChangeClassification {
  readonly browserRequired: boolean;
  readonly changedPaths: readonly string[];
  readonly reason: string;
}

export type GitCommand = (arguments_: readonly string[]) => string;

const releaseCandidateIntegrityPaths = new Set([
  ".github/workflows/release-candidate.yml",
  "config/release-blockers.json",
  "docs/releasing.md",
  "scripts/check-release-candidate-history.ts",
  "scripts/release-candidate-history.test.ts",
  "scripts/release-candidate-history.ts",
  "scripts/release-candidate-lifecycle.test.ts",
  "scripts/release-candidate-lifecycle.ts",
  "scripts/release-candidate-record.ts",
  "scripts/release-candidate-verifier.test.ts",
  "scripts/release-candidate-verifier.ts",
  "scripts/release-candidate-workflow.test.ts",
  "scripts/release-candidate.ts",
  "scripts/release-package-assembly.test.ts",
  "scripts/release-package-assembly.ts",
  "scripts/verify-release-candidate.ts",
]);

function normalizedPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function isBrowserIrrelevantPath(path: string): boolean {
  if (path.length === 0) return false;
  if (/\.md$/i.test(path)) return true;
  if (path.startsWith(".changeset/")) return true;
  if (path.startsWith("config/release-candidates/") && path.endsWith(".json")) return true;
  return releaseCandidateIntegrityPaths.has(path);
}

export function classifyChangedPaths(paths: readonly string[]): BrowserChangeClassification {
  const changedPaths = paths.map(normalizedPath);
  if (changedPaths.length === 0) {
    return {
      browserRequired: true,
      changedPaths,
      reason: "Browser certification is required because the changed-path set is empty.",
    };
  }

  const browserRelevantPath = changedPaths.find((path) => !isBrowserIrrelevantPath(path));
  if (browserRelevantPath !== undefined) {
    return {
      browserRequired: true,
      changedPaths,
      reason: `Browser certification is required because ${browserRelevantPath || "an empty path"} is not explicitly browser-irrelevant.`,
    };
  }

  return {
    browserRequired: false,
    changedPaths,
    reason: `All ${changedPaths.length} changed path${changedPaths.length === 1 ? " is" : "s are"} explicitly browser-irrelevant.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nestedString(value: unknown, ...keys: readonly string[]): string | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function isCommitSha(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{40}$/i.test(value);
}

function isAllZeroSha(value: string): boolean {
  return /^0{40}$/.test(value);
}

function changedPathsFromGit(git: GitCommand, base: string, head: string): readonly string[] {
  git(["cat-file", "-e", `${base}^{commit}`]);
  git(["cat-file", "-e", `${head}^{commit}`]);
  const output = git([
    "diff",
    "--no-renames",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    base,
    head,
  ]);
  return output
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function failClosed(reason: string): BrowserChangeClassification {
  return { browserRequired: true, changedPaths: [], reason };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.split(/\r?\n/, 1)[0]! : String(error);
}

export function classifyGitRange(
  base: string,
  head: string,
  git: GitCommand,
): BrowserChangeClassification {
  if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
    return failClosed(
      "Browser certification is required because the requested Git range is invalid.",
    );
  }
  try {
    return classifyChangedPaths(changedPathsFromGit(git, base, head));
  } catch (error) {
    return failClosed(
      `Browser certification is required because the Git range could not be inspected: ${errorMessage(error)}.`,
    );
  }
}

export function classifyGitHubEvent(options: {
  readonly eventName: string | undefined;
  readonly eventPayload: unknown;
  readonly git: GitCommand;
  readonly githubSha?: string | undefined;
}): BrowserChangeClassification {
  const { eventName, eventPayload, git, githubSha } = options;
  if (eventName === "workflow_dispatch") {
    return failClosed("Browser certification is required for every manual workflow dispatch.");
  }

  if (eventName === "push") {
    const base = nestedString(eventPayload, "before");
    const head = nestedString(eventPayload, "after") ?? githubSha;
    if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
      return failClosed(
        "Browser certification is required because the push base or head SHA is unavailable.",
      );
    }
    return classifyGitRange(base, head, git);
  }

  if (eventName === "pull_request") {
    const base = nestedString(eventPayload, "pull_request", "base", "sha");
    const head = nestedString(eventPayload, "pull_request", "head", "sha");
    if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
      return failClosed(
        "Browser certification is required because the pull-request base or head SHA is unavailable.",
      );
    }
    try {
      git(["cat-file", "-e", `${base}^{commit}`]);
      git(["cat-file", "-e", `${head}^{commit}`]);
      const mergeBase = git(["merge-base", base, head]).trim();
      if (!isCommitSha(mergeBase)) {
        return failClosed(
          "Browser certification is required because the pull-request merge base is unavailable.",
        );
      }
      return classifyChangedPaths(changedPathsFromGit(git, mergeBase, head));
    } catch (error) {
      return failClosed(
        `Browser certification is required because the pull-request merge base or diff could not be inspected: ${errorMessage(error)}.`,
      );
    }
  }

  return failClosed(
    `Browser certification is required because event ${eventName ?? "<missing>"} has no trusted change-scope rule.`,
  );
}

export function repositoryGitCommand(repositoryRoot: string): GitCommand {
  return (arguments_) =>
    execFileSync("git", arguments_, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
}
