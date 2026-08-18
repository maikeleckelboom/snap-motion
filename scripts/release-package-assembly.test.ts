import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { normalizePnpmPackArchive } from "./release-package-assembly.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("release package assembly", () => {
  it("normalizes only the platform-dependent gzip OS byte", async () => {
    const directory = await mkdtemp(join(tmpdir(), "snap-motion-package-assembly-"));
    temporaryDirectories.push(directory);
    const archivePath = resolve(directory, "candidate.tgz");
    const payload = Buffer.from("deterministic package tar payload");
    const linuxArchive = gzipSync(payload);
    linuxArchive[9] = 0x03;
    await writeFile(archivePath, linuxArchive);

    await normalizePnpmPackArchive(archivePath);
    await normalizePnpmPackArchive(archivePath);

    const normalized = await readFile(archivePath);
    const expected = Buffer.from(linuxArchive);
    expected[9] = 0x0a;
    expect(normalized).toEqual(expected);
    expect(gunzipSync(normalized)).toEqual(payload);
  });

  it("rejects an archive that is not gzip-compressed package output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "snap-motion-package-assembly-"));
    temporaryDirectories.push(directory);
    const archivePath = resolve(directory, "candidate.tgz");
    await writeFile(archivePath, "not a gzip archive");

    await expect(normalizePnpmPackArchive(archivePath)).rejects.toThrow(
      /not a supported gzip package archive/,
    );
  });
});
