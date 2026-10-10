import { readdir } from "node:fs/promises";

import { expect, it } from "vitest";

import {
  chromiumScope,
  chromiumStudioSpecs,
  interoperabilitySpecs,
  interoperabilityStudioSpecs,
  previewSpecs,
} from "../config/browserOwnership.ts";

it("partitions every source spec exactly once and never admits a production-preview spec", async () => {
  const files = (await readdir(new URL("../e2e/", import.meta.url))).filter((file) =>
    file.endsWith(".spec.ts"),
  );
  const groups = ["general", "deck", "direct", "studio"].map((group) => {
    const scope = chromiumScope(group);
    return files.filter(
      (file) =>
        !scope.testIgnore?.includes(file) && (!scope.testMatch || scope.testMatch.includes(file)),
    );
  });
  const selected = groups.flat();
  expect(selected.toSorted()).toEqual(
    files.filter((file) => !previewSpecs.includes(file)).toSorted(),
  );
  expect(new Set(selected).size).toBe(selected.length);
});
it("gives the Studio's cross-engine spec exactly one owner per engine, apart from the general ones", async () => {
  const files = await readdir(new URL("../e2e/", import.meta.url));
  for (const spec of interoperabilityStudioSpecs) expect(files).toContain(spec);
  // `firefox` and `webkit` run `interoperabilitySpecs`; `firefox-studio` and `webkit-studio` run
  // the Studio's. A spec in both lists would run twice on one engine and lengthen the general job.
  expect(
    interoperabilitySpecs.filter((spec) => interoperabilityStudioSpecs.includes(spec)),
  ).toEqual([]);
  // Only the Chromium-only layout spec is absent from the cross-engine Studio list.
  expect(chromiumStudioSpecs.filter((spec) => !interoperabilityStudioSpecs.includes(spec))).toEqual(
    ["studio-layout.spec.ts"],
  );
  expect(chromiumScope("general").testIgnore).toEqual(expect.arrayContaining(chromiumStudioSpecs));
});
it("fails closed for an unknown group instead of silently certifying no tests", () => {
  expect(() => chromiumScope("gellery")).toThrow(/Unknown Chromium browser group/);
  expect(chromiumScope(undefined)).toEqual({});
});
