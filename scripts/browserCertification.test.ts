import { expect, it } from "vitest";

import { assertBrowserCertification } from "./browserCertification.ts";

const clean = {
  admission: "success",
  packages: "success",
  linux: "success",
  windows: "success",
  chromium: "success",
  interoperability: "success",
  integration: "success",
};
it("certifies every required matrix, including package integration only and intentional skips", () => {
  expect(() => assertBrowserCertification("true", "true", clean)).not.toThrow();
  expect(() =>
    assertBrowserCertification("false", "true", {
      ...clean,
      chromium: "skipped",
      interoperability: "skipped",
    }),
  ).not.toThrow();
  expect(() =>
    assertBrowserCertification("true", "false", { ...clean, integration: "skipped" }),
  ).not.toThrow();
  expect(() =>
    assertBrowserCertification("false", "false", {
      ...clean,
      chromium: "skipped",
      interoperability: "skipped",
      integration: "skipped",
    }),
  ).not.toThrow();
});
it.each([
  "admission",
  "packages",
  "linux",
  "windows",
  "chromium",
  "interoperability",
  "integration",
] as const)("fails closed when %s fails or unexpectedly skips", (owner) => {
  for (const result of [undefined, "failure", "cancelled", "skipped"]) {
    expect(() => assertBrowserCertification("true", "true", { ...clean, [owner]: result })).toThrow(
      /Source authority|Browser owner|Browser ownership/,
    );
  }
});
it("rejects missing flags and incoherent skip decisions", () => {
  expect(() => assertBrowserCertification(undefined, "true", clean)).toThrow(
    /Source authority|Browser owner|Browser ownership/,
  );
  expect(() => assertBrowserCertification("true", "yes", clean)).toThrow(
    /Source authority|Browser owner|Browser ownership/,
  );
  expect(() => assertBrowserCertification("false", "false", clean)).toThrow(
    /Source authority|Browser owner|Browser ownership/,
  );
});
