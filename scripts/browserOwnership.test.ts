import { readdir } from "node:fs/promises";

import { expect, it } from "vitest";

import { chromiumScope } from "../config/browserOwnership.ts";

it("partitions every source spec exactly once and never admits the production-preview spec", async () => {
  const files = (await readdir(new URL("../e2e/", import.meta.url))).filter((file) =>
    file.endsWith(".spec.ts"),
  );
  const groups = ["general", "deck", "direct"].map((group) => {
    const scope = chromiumScope(group);
    return files.filter(
      (file) =>
        !scope.testIgnore?.includes(file) && (!scope.testMatch || scope.testMatch.includes(file)),
    );
  });
  const selected = groups.flat();
  expect(selected.toSorted()).toEqual(
    files.filter((file) => file !== "media-preview.spec.ts").toSorted(),
  );
  expect(new Set(selected).size).toBe(selected.length);
});
it("fails closed for an unknown group instead of silently certifying no tests", () => {
  expect(() => chromiumScope("gellery")).toThrow(/Unknown Chromium browser group/);
  expect(chromiumScope(undefined)).toEqual({});
});
