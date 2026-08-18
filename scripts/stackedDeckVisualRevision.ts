import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface GitRevisionIdentity {
  readonly dirty: boolean;
  readonly fullSha: string;
  readonly identity: string;
  readonly shortSha: string;
  readonly workingTreeFingerprint: string | null;
}

function git(repoRoot: string, arguments_: readonly string[], encoding: "buffer"): Buffer;
function git(repoRoot: string, arguments_: readonly string[], encoding?: "utf8"): string;
function git(
  repoRoot: string,
  arguments_: readonly string[],
  encoding: "buffer" | "utf8" = "utf8",
): Buffer | string {
  return execFileSync("git", arguments_, {
    cwd: repoRoot,
    encoding: encoding === "buffer" ? "buffer" : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function untrackedFiles(repoRoot: string): readonly string[] {
  const output = git(
    repoRoot,
    ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ":(exclude).artifacts/**"],
    "buffer",
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .toSorted((left, right) => left.localeCompare(right));
}

/**
 * Hashes staged and unstaged binary patches plus every non-ignored untracked path and its bytes.
 * Git's standard ignore rules exclude generated `.artifacts/` output. The index is only read.
 */
export function workingTreeFingerprint(repoRoot: string): string {
  const hash = createHash("sha256");
  hash.update("snap-motion-stacked-deck-working-tree-v1\0");
  hash.update(
    git(
      repoRoot,
      ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--cached", "HEAD", "--", "."],
      "buffer",
    ),
  );
  hash.update("\0unstaged\0");
  hash.update(
    git(repoRoot, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--", "."], "buffer"),
  );
  hash.update("\0untracked\0");
  for (const file of untrackedFiles(repoRoot)) {
    hash.update(file.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(resolve(repoRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

export function inspectGitRevision(repoRoot: string): GitRevisionIdentity {
  const fullSha = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  const shortSha = git(repoRoot, ["rev-parse", "--short=7", "HEAD"]).trim();
  const status = git(
    repoRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    "buffer",
  );
  const dirty = status.length > 0;
  const fingerprint = dirty ? workingTreeFingerprint(repoRoot) : null;
  return {
    dirty,
    fullSha,
    identity: dirty ? `${shortSha}-dirty-${fingerprint}` : shortSha,
    shortSha,
    workingTreeFingerprint: fingerprint,
  };
}
