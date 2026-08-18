import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { packedText, readPackedArchive } from "./packedArchive.ts";
import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

export interface ReleasePackageAuthority {
  readonly bytes: number;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly exports: readonly string[];
  readonly file: string;
  readonly name: string;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly private: boolean;
  readonly sha256: string;
  readonly sideEffects: boolean | readonly string[];
  readonly version: string;
}

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly private: boolean;
  readonly sideEffects: boolean | readonly string[];
  readonly version: string;
}

// pnpm's tar payload is deterministic, but its gzip wrapper records the host OS.
// 0x0a is the byte used by the adopted Windows-produced beta.9 archives, so it is
// the compatibility boundary for both existing records and future candidates.
const canonicalGzipOperatingSystem = 0x0a;

export async function normalizePnpmPackArchive(archivePath: string): Promise<void> {
  const archive = await readFile(archivePath);
  if (archive.length < 10 || archive[0] !== 0x1f || archive[1] !== 0x8b || archive[2] !== 0x08) {
    throw new Error(`${archivePath} is not a supported gzip package archive.`);
  }
  if (archive[9] === canonicalGzipOperatingSystem) return;

  archive[9] = canonicalGzipOperatingSystem;
  await writeFile(archivePath, archive);
}

function exportTargets(value: unknown): readonly string[] {
  if (typeof value === "string") return value.startsWith("./") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}

export async function packReleasePackages(
  repositoryRoot: string,
  artifactsDirectory = resolve(repositoryRoot, ".artifacts/packages"),
): Promise<void> {
  const pnpm = resolveRepositoryPnpm(repositoryRoot);

  runPnpmSync(pnpm, ["build:packages"], { cwd: repositoryRoot });
  await packPreparedReleasePackages(repositoryRoot, artifactsDirectory);
}

export async function packPreparedReleasePackages(
  repositoryRoot: string,
  artifactsDirectory = resolve(repositoryRoot, ".artifacts/packages"),
): Promise<void> {
  const pnpm = resolveRepositoryPnpm(repositoryRoot);

  await rm(artifactsDirectory, { force: true, recursive: true });
  await mkdir(artifactsDirectory, { recursive: true });
  runPnpmSync(pnpm, ["pack", "--out", resolve(artifactsDirectory, "snap-motion-core-%v.tgz")], {
    cwd: resolve(repositoryRoot, "packages/core"),
  });
  runPnpmSync(pnpm, ["pack", "--out", resolve(artifactsDirectory, "snap-motion-vue-%v.tgz")], {
    cwd: resolve(repositoryRoot, "packages/vue"),
  });
  const archives = (await readdir(artifactsDirectory)).filter((file) => file.endsWith(".tgz"));
  await Promise.all(
    archives.map((archive) => normalizePnpmPackArchive(resolve(artifactsDirectory, archive))),
  );
}

export async function inspectReleasePackages(
  artifactsDirectory: string,
): Promise<readonly ReleasePackageAuthority[]> {
  const artifacts = (await readdir(artifactsDirectory))
    .filter((file) => file.endsWith(".tgz"))
    .toSorted();
  if (artifacts.length === 0) {
    throw new Error(`No package archives exist in ${artifactsDirectory}.`);
  }

  const packages: ReleasePackageAuthority[] = [];
  for (const artifact of artifacts) {
    const archivePath = resolve(artifactsDirectory, artifact);
    const entries = await readPackedArchive(archivePath);
    const manifest = JSON.parse(packedText(entries, "package/package.json")) as PackageManifest;
    for (const target of exportTargets(manifest.exports)) {
      const packedTarget = `package/${target.slice(2)}`;
      if (!entries.has(packedTarget)) {
        throw new Error(`${artifact} export target does not exist: ${target}`);
      }
    }

    const data = await readFile(archivePath);
    packages.push({
      name: manifest.name,
      version: manifest.version,
      file: artifact,
      bytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      private: manifest.private,
      sideEffects: manifest.sideEffects,
      exports: Object.keys(manifest.exports).toSorted(),
      dependencies: manifest.dependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
    });
  }

  const names = new Set(packages.map(({ name }) => name));
  if (names.size !== packages.length) {
    throw new Error("Packed release artifacts contain duplicate package identities.");
  }
  return packages.toSorted((left, right) => left.name.localeCompare(right.name));
}
