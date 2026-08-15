import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ReleasePackageAuthority } from "./release-package-assembly.ts";

export interface CandidatePackageVersion {
  readonly name: string;
  readonly version: string;
}

export interface CandidateHistoryEntry {
  readonly file: string;
  readonly packages: readonly CandidatePackageVersion[];
}

export interface PendingChangeset {
  readonly name: string;
  readonly packages: readonly string[];
}

interface MaterializeCandidateOptions {
  readonly artifactsRoot: string;
  readonly packageSourceDirectory: string;
  readonly packages: readonly ReleasePackageAuthority[];
  readonly recordSource: string;
}

interface FinalizeNewCandidateOptions extends MaterializeCandidateOptions {
  readonly candidateRecord: string;
}

export function alignedCandidateVersion(packages: readonly CandidatePackageVersion[]): string {
  if (packages.length === 0) throw new Error("A release candidate must contain packages.");
  const versions = new Set(packages.map(({ version }) => version));
  if (versions.size !== 1) {
    throw new Error(
      `Core and Vue candidate versions must remain aligned; received ${packages.map(({ name, version }) => `${name}@${version}`).join(", ")}.`,
    );
  }
  return packages[0]!.version;
}

export function pendingChangesets(
  sources: Readonly<Record<string, string>>,
  consumedNames: readonly string[],
): readonly PendingChangeset[] {
  const consumed = new Set(consumedNames);
  return Object.entries(sources)
    .filter(([name]) => name !== "README" && !consumed.has(name))
    .map(([name, source]) => ({
      name,
      packages: [...source.matchAll(/^"([^"]+)":\s+(?:major|minor|patch)$/gm)].map(
        (match) => match[1]!,
      ),
    }))
    .filter(({ packages }) => packages.length > 0)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function assertCandidateEligible(
  packages: readonly CandidatePackageVersion[],
  history: readonly CandidateHistoryEntry[],
  pending: readonly PendingChangeset[],
): string {
  const version = alignedCandidateVersion(packages);
  const packageNames = new Set(packages.map(({ name }) => name));
  const collision = history.find((entry) =>
    entry.packages.some(
      (historicalPackage) =>
        packageNames.has(historicalPackage.name) && historicalPackage.version === version,
    ),
  );
  if (!collision) return version;

  const relevantPending = pending.filter((changeset) =>
    changeset.packages.some((name) => packageNames.has(name)),
  );
  const releaseIntent =
    relevantPending.length > 0
      ? ` Pending release intent (${relevantPending.map(({ name }) => name).join(", ")}) has advanced beyond the current package version.`
      : "";
  throw new Error(
    `Prerelease ${version} is an immutable candidate already certified by ${collision.file}.${releaseIntent} Run the repository Changesets versioning step before generating another candidate. Existing immutable prerelease versions may not be reused. Inspect the archived producer manifest instead of regenerating this candidate.`,
  );
}

function candidateChecksums(packages: readonly ReleasePackageAuthority[]): string {
  return `${packages.map(({ file, sha256 }) => `${sha256}  ${file}`).join("\n")}\n`;
}

export async function materializeCandidateArtifacts({
  artifactsRoot,
  packageSourceDirectory,
  packages,
  recordSource,
}: MaterializeCandidateOptions): Promise<void> {
  await mkdir(artifactsRoot, { recursive: true });
  const stagingRoot = await mkdtemp(resolve(artifactsRoot, ".candidate-staging-"));
  const stagedPackages = resolve(stagingRoot, "packages");
  const stagedRelease = resolve(stagingRoot, "release");
  const destinationPackages = resolve(artifactsRoot, "packages");
  const destinationRelease = resolve(artifactsRoot, "release");

  try {
    await mkdir(stagedPackages, { recursive: true });
    await mkdir(stagedRelease, { recursive: true });
    for (const candidatePackage of packages) {
      await cp(
        resolve(packageSourceDirectory, candidatePackage.file),
        resolve(stagedPackages, candidatePackage.file),
      );
    }
    await writeFile(resolve(stagedRelease, "SHA256SUMS"), candidateChecksums(packages));
    await writeFile(resolve(stagedRelease, "release-manifest.json"), recordSource);

    await rm(destinationPackages, { force: true, recursive: true });
    await rename(stagedPackages, destinationPackages);
    await rm(destinationRelease, { force: true, recursive: true });
    await rename(stagedRelease, destinationRelease);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

export async function finalizeNewCandidate({
  candidateRecord,
  ...materializeOptions
}: FinalizeNewCandidateOptions): Promise<void> {
  // The exclusive record reservation precedes mutation of existing ignored output. If artifact
  // finalization is interrupted, the immutable record remains the recovery authority.
  await writeFile(candidateRecord, materializeOptions.recordSource, {
    encoding: "utf8",
    flag: "wx",
  });
  await materializeCandidateArtifacts(materializeOptions);
}
