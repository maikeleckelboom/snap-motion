import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  alignedCandidateVersion,
  type CandidateHistoryEntry,
} from "./release-candidate-lifecycle.ts";
import type { ReleasePackageAuthority } from "./release-package-assembly.ts";

export interface CandidateSourceAuthority {
  readonly branch: string;
  readonly commit: string;
  readonly repository: string;
  readonly visibility: string;
}

export interface CandidateRecord {
  readonly blockers: readonly Readonly<Record<string, unknown>>[];
  readonly createdAt: string;
  readonly intendedDistTag: string;
  readonly packages: readonly ReleasePackageAuthority[];
  readonly private: boolean;
  readonly published: boolean;
  readonly schemaVersion: 1;
  readonly source: CandidateSourceAuthority;
  readonly verification: {
    readonly command: string;
    readonly passed: true;
  };
}

function fail(label: string, detail: string): never {
  throw new Error(`Invalid candidate record ${label}: ${detail}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(label, "expected an object.");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) return fail(label, "expected a string.");
  return value;
}

function stringMap(value: unknown, label: string): Readonly<Record<string, string>> {
  const source = object(value, label);
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== "string") return fail(`${label}.${key}`, "expected a string.");
  }
  return source as Readonly<Record<string, string>>;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return fail(label, "expected an array of strings.");
  }
  return value as readonly string[];
}

function parsePackage(value: unknown, label: string): ReleasePackageAuthority {
  const source = object(value, label);
  const bytes = source.bytes;
  if (!Number.isSafeInteger(bytes) || (bytes as number) < 0) {
    return fail(`${label}.bytes`, "expected a non-negative safe integer.");
  }
  const sha256 = string(source.sha256, `${label}.sha256`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) return fail(`${label}.sha256`, "expected a SHA-256 hash.");
  if (typeof source.private !== "boolean") return fail(`${label}.private`, "expected a boolean.");
  const sideEffects = source.sideEffects;
  if (
    typeof sideEffects !== "boolean" &&
    (!Array.isArray(sideEffects) || sideEffects.some((entry) => typeof entry !== "string"))
  ) {
    return fail(`${label}.sideEffects`, "expected a boolean or an array of strings.");
  }

  return {
    name: string(source.name, `${label}.name`),
    version: string(source.version, `${label}.version`),
    file: string(source.file, `${label}.file`),
    bytes: bytes as number,
    sha256,
    private: source.private,
    sideEffects: sideEffects as boolean | readonly string[],
    exports: stringArray(source.exports, `${label}.exports`),
    dependencies: stringMap(source.dependencies, `${label}.dependencies`),
    peerDependencies: stringMap(source.peerDependencies, `${label}.peerDependencies`),
  };
}

export function parseCandidateRecord(source: string, label: string): CandidateRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid candidate record ${label}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const record = object(parsed, label);
  if (record.schemaVersion !== 1) return fail(`${label}.schemaVersion`, "expected 1.");
  const sourceAuthority = object(record.source, `${label}.source`);
  const commit = string(sourceAuthority.commit, `${label}.source.commit`);
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    return fail(`${label}.source.commit`, "expected a full Git commit hash.");
  }
  const verification = object(record.verification, `${label}.verification`);
  if (verification.passed !== true) {
    return fail(`${label}.verification.passed`, "expected true.");
  }
  if (!Array.isArray(record.packages) || record.packages.length === 0) {
    return fail(`${label}.packages`, "expected at least one package.");
  }
  const packages = record.packages.map((entry, index) =>
    parsePackage(entry, `${label}.packages[${index}]`),
  );
  if (new Set(packages.map(({ name }) => name)).size !== packages.length) {
    return fail(`${label}.packages`, "package identities must be unique.");
  }
  if (new Set(packages.map(({ file }) => file)).size !== packages.length) {
    return fail(`${label}.packages`, "package archive names must be unique.");
  }
  if (typeof record.private !== "boolean") return fail(`${label}.private`, "expected a boolean.");
  if (typeof record.published !== "boolean") {
    return fail(`${label}.published`, "expected a boolean.");
  }
  if (!Array.isArray(record.blockers)) return fail(`${label}.blockers`, "expected an array.");

  return {
    schemaVersion: 1,
    createdAt: string(record.createdAt, `${label}.createdAt`),
    source: {
      repository: string(sourceAuthority.repository, `${label}.source.repository`),
      visibility: string(sourceAuthority.visibility, `${label}.source.visibility`),
      branch: string(sourceAuthority.branch, `${label}.source.branch`),
      commit,
    },
    verification: {
      command: string(verification.command, `${label}.verification.command`),
      passed: true,
    },
    packages,
    private: record.private,
    published: record.published,
    intendedDistTag: string(record.intendedDistTag, `${label}.intendedDistTag`),
    blockers: record.blockers.map((entry, index) => object(entry, `${label}.blockers[${index}]`)),
  };
}

export function serializeCandidateRecord(record: CandidateRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export async function readCandidateRecord(recordPath: string): Promise<{
  readonly record: CandidateRecord;
  readonly source: string;
}> {
  const source = await readFile(recordPath, "utf8");
  const record = parseCandidateRecord(source, recordPath);
  const version = alignedCandidateVersion(record.packages);
  if (basename(recordPath) !== `${version}.json`) {
    throw new Error(`Candidate record ${recordPath} must be named ${version}.json.`);
  }
  return { record, source };
}

export async function candidateHistory(
  candidateHistoryDirectory: string,
): Promise<readonly CandidateHistoryEntry[]> {
  const files = (await readdir(candidateHistoryDirectory))
    .filter((file) => file.endsWith(".json"))
    .toSorted();
  return Promise.all(
    files.map(async (file) => {
      const { record } = await readCandidateRecord(resolve(candidateHistoryDirectory, file));
      return {
        file: `config/release-candidates/${file}`,
        packages: record.packages,
      };
    }),
  );
}

function normalizedPackage(candidate: ReleasePackageAuthority) {
  return {
    ...candidate,
    exports: [...candidate.exports].toSorted(),
    dependencies: Object.fromEntries(Object.entries(candidate.dependencies).toSorted()),
    peerDependencies: Object.fromEntries(Object.entries(candidate.peerDependencies).toSorted()),
  };
}

export function assertPackageAuthorityMatches(
  recorded: readonly ReleasePackageAuthority[],
  assembled: readonly ReleasePackageAuthority[],
): void {
  const normalizedRecorded = recorded
    .map(normalizedPackage)
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const normalizedAssembled = assembled
    .map(normalizedPackage)
    .toSorted((left, right) => left.name.localeCompare(right.name));
  if (!isDeepStrictEqual(normalizedAssembled, normalizedRecorded)) {
    const expected = JSON.stringify(normalizedRecorded, null, 2);
    const actual = JSON.stringify(normalizedAssembled, null, 2);
    throw new Error(
      `Recorded candidate package authority does not match the historical assembly.\nExpected:\n${expected}\nActual:\n${actual}`,
    );
  }
}
