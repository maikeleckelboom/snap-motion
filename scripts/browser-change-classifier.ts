import { execFileSync } from "node:child_process";

/**
 * Verification ownership. Every flag names a CI owner that must succeed when true and must be
 * skipped when false (enforced by browserCertification.ts):
 * - packageAuthority: builds/packs the one package authority consumed by Linux and integration.
 * - linuxVerification: format, lint, typecheck, unit tests, API/size/app builds (needs authority).
 * - windowsPortability: package assembly, pnpm CLI invocation and pack behavior on Windows.
 * - browser: lab Chromium/Firefox/WebKit owners.
 * - packageIntegration: preview, framework fixtures and packed Nuxt hydration.
 */
export interface VerificationOwners {
  readonly packageAuthorityRequired: boolean;
  readonly linuxVerificationRequired: boolean;
  readonly windowsPortabilityRequired: boolean;
  readonly browserRequired: boolean;
  readonly packageIntegrationRequired: boolean;
}

export type VerificationOwner = keyof VerificationOwners;

export interface BrowserChangeClassification extends VerificationOwners {
  /** True only when every owner is required: the sole run shape that may certify a candidate. */
  readonly fullSourceCertification: boolean;
  readonly changedPaths: readonly string[];
  readonly reason: string;
  /** Changed paths that caused each owner, for auditable summaries. */
  readonly triggers: Readonly<Record<VerificationOwner, readonly string[]>>;
}

export type GitCommand = (arguments_: readonly string[]) => string;

export const ownerLabels: Readonly<Record<VerificationOwner, string>> = {
  packageAuthorityRequired: "Package authority",
  linuxVerificationRequired: "Linux verification",
  windowsPortabilityRequired: "Windows portability",
  browserRequired: "Source browsers",
  packageIntegrationRequired: "Package integration",
};
export const verificationOwners = Object.keys(ownerLabels) as VerificationOwner[];

const none: VerificationOwners = {
  packageAuthorityRequired: false,
  linuxVerificationRequired: false,
  windowsPortabilityRequired: false,
  browserRequired: false,
  packageIntegrationRequired: false,
};
const everything: VerificationOwners = {
  packageAuthorityRequired: true,
  linuxVerificationRequired: true,
  windowsPortabilityRequired: true,
  browserRequired: true,
  packageIntegrationRequired: true,
};

/** Release tooling that only Linux unit/lint/typecheck can exercise (no browser, no Windows run). */
const linuxToolingPaths = new Set([
  ".github/workflows/release-candidate.yml",
  "config/release-blockers.json",
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
  "scripts/sourceVerification.test.ts",
  "scripts/sourceVerification.ts",
  "scripts/sourceVerificationRecord.test.ts",
  "scripts/verify-release-candidate.ts",
]);

// Archive construction and process invocation: Windows runs these tests and `pack:packages`.
const packageToolingPaths = new Set([
  "scripts/pack-packages.ts",
  "scripts/packedArchive.ts",
  "scripts/pnpm-cli.ts",
  "scripts/release-package-assembly.ts",
]);
// Tests and browser-free package checks: portability-relevant, but no consumer integration.
const packageToolingTestPaths = new Set([
  "scripts/pnpm-cli.test.ts",
  "scripts/release-package-assembly.test.ts",
  "scripts/verify-packages.ts",
]);
// Packed/preview consumers: integration proof, with Linux static checks over the sources.
const integrationPaths = new Set([
  "scripts/verifyPackagesBrowser.ts",
  "scripts/certifySurfacePreferences.ts",
  "e2e/media-preview.spec.ts",
]);

function normalizedPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

/** Documentation, reporting data and immutable provenance: never package or behavior input. */
function isMetadataPath(path: string): boolean {
  if (/^[^/]+\.md$/i.test(path)) return true;
  if (/^docs\/.+\.md$/i.test(path)) return true;
  if (/^\.changeset\/[^/]+\.md$/i.test(path)) return true;
  if (/^config\/release-candidates\/[^/]+\.json$/.test(path)) return true;
  return (
    path === "config/test-performance-before.json" || path === "config/test-performance-after.json"
  );
}

function ownersForPath(path: string): VerificationOwners {
  if (path.length === 0) return everything;
  if (isMetadataPath(path)) return none;
  if (linuxToolingPaths.has(path)) return { ...none, linuxVerificationRequired: true };
  if (packageToolingPaths.has(path))
    return { ...none, windowsPortabilityRequired: true, packageIntegrationRequired: true };
  if (packageToolingTestPaths.has(path) || /^packages\/.+\.md$/i.test(path))
    return { ...none, windowsPortabilityRequired: true, linuxVerificationRequired: true };
  if (
    integrationPaths.has(path) ||
    path.startsWith("fixture-e2e/") ||
    path.startsWith("fixtures/packed-consumers/")
  )
    return { ...none, packageIntegrationRequired: true };
  if (path.startsWith("e2e/")) return { ...none, browserRequired: true };
  // Unknown paths, config, dependencies, production source and shared CSS fail closed.
  return everything;
}

/** Browsers and integration consume Linux-verified source; Linux and integration consume the authority. */
export function withOwnerDependencies(required: VerificationOwners): VerificationOwners {
  const linux =
    required.linuxVerificationRequired ||
    required.browserRequired ||
    required.packageIntegrationRequired;
  return { ...required, linuxVerificationRequired: linux, packageAuthorityRequired: linux };
}

function emptyTriggers(): Record<VerificationOwner, string[]> {
  return {
    packageAuthorityRequired: [],
    linuxVerificationRequired: [],
    windowsPortabilityRequired: [],
    browserRequired: [],
    packageIntegrationRequired: [],
  };
}

function failClosed(reason: string): BrowserChangeClassification {
  return {
    ...everything,
    fullSourceCertification: true,
    changedPaths: [],
    reason,
    triggers: emptyTriggers(),
  };
}

export function classifyChangedPaths(paths: readonly string[]): BrowserChangeClassification {
  const changedPaths = paths.map(normalizedPath);
  if (changedPaths.length === 0)
    return failClosed("Full verification is required because the changed-path set is empty.");

  // The union is monotonic: a metadata path contributes nothing and can never downgrade another.
  const union: Record<VerificationOwner, boolean> = { ...none };
  const triggers = emptyTriggers();
  for (const path of changedPaths) {
    const required = withOwnerDependencies(ownersForPath(path));
    for (const owner of verificationOwners)
      if (required[owner]) {
        union[owner] = true;
        triggers[owner].push(path);
      }
  }
  const required = withOwnerDependencies(union);
  const labels = verificationOwners.filter((owner) => required[owner]).map((o) => ownerLabels[o]);
  return {
    ...required,
    fullSourceCertification: verificationOwners.every((owner) => required[owner]),
    changedPaths,
    triggers,
    reason:
      labels.length === 0
        ? `All ${changedPaths.length} changed path${changedPaths.length === 1 ? " is" : "s are"} documentation, audit or immutable-record metadata.`
        : `Changed paths require: ${labels.join(", ")}. Unknown paths require every owner.`,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.split(/\r?\n/, 1)[0]! : String(error);
}

export function classifyGitRange(
  base: string,
  head: string,
  git: GitCommand,
): BrowserChangeClassification {
  if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
    return failClosed("Full verification is required because the requested Git range is invalid.");
  }
  try {
    return classifyChangedPaths(changedPathsFromGit(git, base, head));
  } catch (error) {
    return failClosed(
      `Full verification is required because the Git range could not be inspected: ${errorMessage(error)}.`,
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
    return failClosed("Full verification is required for every manual workflow dispatch.");
  }

  if (eventName === "push") {
    const base = nestedString(eventPayload, "before");
    const head = nestedString(eventPayload, "after") ?? githubSha;
    if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
      return failClosed(
        "Full verification is required because the push base or head SHA is unavailable.",
      );
    }
    return classifyGitRange(base, head, git);
  }

  if (eventName === "pull_request") {
    const base = nestedString(eventPayload, "pull_request", "base", "sha");
    const head = nestedString(eventPayload, "pull_request", "head", "sha");
    if (!isCommitSha(base) || !isCommitSha(head) || isAllZeroSha(base) || isAllZeroSha(head)) {
      return failClosed(
        "Full verification is required because the pull-request base or head SHA is unavailable.",
      );
    }
    try {
      git(["cat-file", "-e", `${base}^{commit}`]);
      git(["cat-file", "-e", `${head}^{commit}`]);
      const mergeBase = git(["merge-base", base, head]).trim();
      if (!isCommitSha(mergeBase)) {
        return failClosed(
          "Full verification is required because the pull-request merge base is unavailable.",
        );
      }
      return classifyChangedPaths(changedPathsFromGit(git, mergeBase, head));
    } catch (error) {
      return failClosed(
        `Full verification is required because the pull-request merge base or diff could not be inspected: ${errorMessage(error)}.`,
      );
    }
  }

  return failClosed(
    `Full verification is required because event ${eventName ?? "<missing>"} has no trusted change-scope rule.`,
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
