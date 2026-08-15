import { spawnSync } from "node:child_process";

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw result.error ?? new Error(result.stderr || `git ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function historyViolation(status: string, paths: string): string {
  if (status.startsWith("M") || status.startsWith("T")) return `modified: ${paths}`;
  if (status.startsWith("D")) return `deleted: ${paths}`;
  if (status.startsWith("R") || status.startsWith("C")) return `renamed or replaced: ${paths}`;
  return `changed with forbidden status ${status}: ${paths}`;
}

export function assertReleaseCandidateHistory(repositoryRoot: string): void {
  if (git(repositoryRoot, ["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error(
      "Release-candidate history cannot be certified from a shallow checkout. Fetch full history (actions/checkout fetch-depth: 0) and retry.",
    );
  }

  const history = git(repositoryRoot, [
    "log",
    "-m",
    "--full-history",
    "--format=commit:%H",
    "--name-status",
    "--find-renames",
    "HEAD",
    "--",
    ":(glob)config/release-candidates/*.json",
  ]);
  const violations: string[] = [];
  let commit = "unknown";
  for (const line of history.split(/\r?\n/)) {
    if (line.startsWith("commit:")) {
      commit = line.slice("commit:".length);
      continue;
    }
    const match = /^([A-Z][0-9]*)\t(.+)$/.exec(line);
    if (!match || match[1]!.startsWith("A")) continue;
    violations.push(`${commit} ${historyViolation(match[1]!, match[2]!)}`);
  }

  const worktree = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ":(glob)config/release-candidates/*.json",
  ]);
  for (const line of worktree.split(/\r?\n/).filter(Boolean)) {
    const status = line.slice(0, 2);
    if (status === "??" || status.startsWith("A")) continue;
    violations.push(`working tree ${historyViolation(status.trim() || status, line.slice(3))}`);
  }

  if (violations.length > 0) {
    throw new Error(
      `Immutable release-candidate history is append-only. Existing records may never be modified, deleted, renamed, copied as replacements, or recreated. Only a new config/release-candidates/<version>.json addition is permitted.\n${violations.join("\n")}`,
    );
  }
}
