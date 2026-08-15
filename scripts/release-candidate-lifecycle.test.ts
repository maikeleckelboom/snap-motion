import { describe, expect, it } from "vitest";

import {
  assertCandidateEligible,
  pendingChangesets,
  type CandidateHistoryEntry,
  type CandidatePackageVersion,
} from "./release-candidate-lifecycle.ts";

const beta9: readonly CandidatePackageVersion[] = [
  { name: "@snap-motion/core", version: "0.1.0-beta.9" },
  { name: "@snap-motion/vue", version: "0.1.0-beta.9" },
];
const history: readonly CandidateHistoryEntry[] = [
  { file: "config/release-candidates/0.1.0-beta.9.json", packages: beta9 },
];
const unrecordedVersion = "0.1.0-beta.next";

describe("release candidate lifecycle", () => {
  it("reports pending package intent when an archived version would be reused", () => {
    expect(() =>
      assertCandidateEligible(beta9, history, [
        { name: "coverflow-pointer-focus", packages: ["@snap-motion/core", "@snap-motion/vue"] },
      ]),
    ).toThrow(/Pending release intent .* has advanced beyond the current package version/);
  });

  it("blocks archived-version reuse even when an engineer forgot a Changeset", () => {
    expect(() => assertCandidateEligible(beta9, history, [])).toThrow(
      /Existing immutable prerelease versions may not be reused/,
    );
  });

  it("allows the next aligned version after Changesets versioning", () => {
    expect(
      assertCandidateEligible(
        beta9.map(({ name }) => ({ name, version: unrecordedVersion })),
        history,
        [],
      ),
    ).toBe(unrecordedVersion);
  });

  it("does not require release intent for documentation-only work before first certification", () => {
    const firstCandidate = beta9.map(({ name }) => ({ name, version: unrecordedVersion }));
    expect(assertCandidateEligible(firstCandidate, history, [])).toBe(unrecordedVersion);
  });

  it("keeps inspection separate from candidate regeneration", () => {
    expect(history[0]?.packages).toEqual(beta9);
    expect(() => assertCandidateEligible(beta9, history, [])).toThrow(
      /Inspect the archived producer manifest instead of regenerating/,
    );
  });

  it("fails closed when Core and Vue versions diverge", () => {
    expect(() =>
      assertCandidateEligible(
        [beta9[0]!, { name: "@snap-motion/vue", version: unrecordedVersion }],
        history,
        [],
      ),
    ).toThrow(/Core and Vue candidate versions must remain aligned/);
  });

  it("distinguishes new Changesets from prerelease state that has already consumed them", () => {
    const sources = {
      "beta-nine-closure": '---\n"@snap-motion/vue": minor\n---\n\nOld intent.\n',
      "coverflow-pointer-focus":
        '---\n"@snap-motion/core": minor\n"@snap-motion/vue": minor\n---\n\nNew intent.\n',
    };

    expect(pendingChangesets(sources, ["beta-nine-closure"])).toEqual([
      {
        name: "coverflow-pointer-focus",
        packages: ["@snap-motion/core", "@snap-motion/vue"],
      },
    ]);
  });
});
