import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { parseCandidateRecord, serializeCandidateRecord } from "./release-candidate-record.ts";
import { fetchVerifiedSource } from "./sourceVerification.ts";

it("preserves new GitHub provenance and existing historical records without changing their schema", async () => {
  const source = await readFile(
    new URL("../config/release-candidates/0.1.0-beta.14.json", import.meta.url),
    "utf8",
  );
  const record = parseCandidateRecord(source, "historical");
  expect(record.verification.github).toBeUndefined();
  const github = {
    runId: 123,
    runAttempt: 2,
    artifactId: 456,
    artifactDigest: `sha256:${"a".repeat(64)}`,
    url: "https://github.com/maikeleckelboom/snap-motion/actions/runs/123",
  };
  const proposed = { ...record, verification: { ...record.verification, github } };
  expect(parseCandidateRecord(serializeCandidateRecord(proposed), "new")).toEqual(proposed);
  for (const change of [
    { runId: 0 },
    { runAttempt: -1 },
    { artifactId: 1.5 },
    { artifactDigest: "local-marker" },
    { url: "https://attacker.example/123" },
  ]) {
    expect(() =>
      parseCandidateRecord(
        serializeCandidateRecord({
          ...proposed,
          verification: { ...proposed.verification, github: { ...github, ...change } },
        }),
        "invalid",
      ),
    ).toThrow(/Invalid candidate record/);
  }
});
it("rejects a locally planted verification marker before any GitHub query", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snap-motion-marker-test-"));
  try {
    await writeFile(join(directory, "source-verification.json"), '{"verified":true}');
    await expect(fetchVerifiedSource("a".repeat(40), "dev", directory)).rejects.toThrow(
      "fresh empty directory",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
