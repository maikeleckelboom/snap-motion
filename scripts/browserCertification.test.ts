import { expect, it } from "vitest";

import {
  assertBrowserCertification,
  isFullSourceCertification,
  type CertificationRequirements,
  type CertificationResults,
} from "./browserCertification.ts";

const fullRequirements: CertificationRequirements = {
  packages: "true",
  linux: "true",
  windows: "true",
  browser: "true",
  integration: "true",
};
const lightRequirements: CertificationRequirements = {
  packages: "false",
  linux: "false",
  windows: "false",
  browser: "false",
  integration: "false",
};
const fullResults: CertificationResults = {
  admission: "success",
  packages: "success",
  metadataFormat: "skipped",
  linux: "success",
  windows: "success",
  chromium: "success",
  interoperability: "success",
  integration: "success",
};
const lightResults: CertificationResults = {
  admission: "success",
  packages: "skipped",
  metadataFormat: "success",
  linux: "skipped",
  windows: "skipped",
  chromium: "skipped",
  interoperability: "skipped",
  integration: "skipped",
};
const message = /Verification owner|Verification ownership|Source authority/;

it("certifies the full matrix and every correctly skipped classification", () => {
  expect(() => assertBrowserCertification(fullRequirements, fullResults)).not.toThrow();
  expect(() => assertBrowserCertification(lightRequirements, lightResults)).not.toThrow();
  // Tooling-only: authority + Linux, nothing else.
  expect(() =>
    assertBrowserCertification(
      { ...lightRequirements, packages: "true", linux: "true" },
      { ...lightResults, packages: "success", linux: "success", metadataFormat: "skipped" },
    ),
  ).not.toThrow();
  // Integration only (plus its dependencies).
  expect(() =>
    assertBrowserCertification(
      { ...lightRequirements, packages: "true", linux: "true", integration: "true" },
      {
        ...lightResults,
        packages: "success",
        linux: "success",
        integration: "success",
        metadataFormat: "skipped",
      },
    ),
  ).not.toThrow();
});

it.each(["packages", "linux", "windows", "chromium", "interoperability", "integration"] as const)(
  "rejects a required %s owner that failed, was cancelled, was missing or skipped",
  (owner) => {
    for (const result of [undefined, "failure", "cancelled", "skipped"])
      expect(() =>
        assertBrowserCertification(fullRequirements, { ...fullResults, [owner]: result }),
      ).toThrow(message);
  },
);

it.each(["packages", "linux", "windows", "chromium", "interoperability", "integration"] as const)(
  "rejects a not-required %s owner that ran or failed",
  (owner) => {
    for (const result of ["success", "failure", "cancelled", undefined])
      expect(() =>
        assertBrowserCertification(lightRequirements, { ...lightResults, [owner]: result }),
      ).toThrow(message);
  },
);

it("requires the metadata format gate exactly when Linux verification is skipped", () => {
  for (const result of ["skipped", "failure", "cancelled", undefined])
    expect(() =>
      assertBrowserCertification(lightRequirements, { ...lightResults, metadataFormat: result }),
    ).toThrow(message);
  for (const result of ["success", "failure", undefined])
    expect(() =>
      assertBrowserCertification(fullRequirements, { ...fullResults, metadataFormat: result }),
    ).toThrow(message);
});

it("never accepts a failed admission", () => {
  for (const result of [undefined, "failure", "skipped", "cancelled"])
    expect(() =>
      assertBrowserCertification(lightRequirements, { ...lightResults, admission: result }),
    ).toThrow(message);
});

it("rejects missing flags and incoherent ownership", () => {
  expect(() =>
    assertBrowserCertification({ ...fullRequirements, browser: undefined }, fullResults),
  ).toThrow(message);
  expect(() =>
    assertBrowserCertification({ ...fullRequirements, windows: "yes" }, fullResults),
  ).toThrow(message);
  // Linux without its authority, or browsers/integration without Linux, is impossible.
  expect(() =>
    assertBrowserCertification({ ...lightRequirements, linux: "true" }, lightResults),
  ).toThrow(/incoherent/);
  expect(() =>
    assertBrowserCertification({ ...lightRequirements, browser: "true" }, lightResults),
  ).toThrow(/incoherent/);
  expect(() =>
    assertBrowserCertification(
      { ...lightRequirements, packages: "true", integration: "true" },
      lightResults,
    ),
  ).toThrow(/incoherent/);
  // A full-matrix result set cannot satisfy a lightweight classification.
  expect(() => assertBrowserCertification(lightRequirements, fullResults)).toThrow(message);
});

it("identifies candidate-eligible certification only when every owner is required", () => {
  expect(isFullSourceCertification(fullRequirements)).toBe(true);
  for (const owner of Object.keys(fullRequirements) as (keyof CertificationRequirements)[])
    expect(isFullSourceCertification({ ...fullRequirements, [owner]: "false" })).toBe(false);
  expect(isFullSourceCertification(lightRequirements)).toBe(false);
});
