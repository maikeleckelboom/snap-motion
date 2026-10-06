export interface CertificationResults {
  readonly admission: string | undefined;
  readonly packages: string | undefined;
  readonly linux: string | undefined;
  readonly windows: string | undefined;
  readonly chromium: string | undefined;
  readonly interoperability: string | undefined;
  readonly integration: string | undefined;
}

export function assertBrowserCertification(
  sourceRequired: string | undefined,
  integrationRequired: string | undefined,
  results: CertificationResults,
): void {
  if (
    !["true", "false"].includes(sourceRequired ?? "") ||
    !["true", "false"].includes(integrationRequired ?? "")
  ) {
    throw new Error("Browser ownership outputs are missing or invalid.");
  }
  for (const owner of ["admission", "packages", "linux", "windows"] as const) {
    if (results[owner] !== "success")
      throw new Error(`Source authority ${owner} did not succeed: ${results[owner]}.`);
  }
  for (const owner of ["chromium", "interoperability", "integration"] as const) {
    const required = owner === "integration" ? integrationRequired : sourceRequired;
    const expected = required === "true" ? "success" : "skipped";
    if (results[owner] !== expected)
      throw new Error(`Browser owner ${owner}: expected ${expected}, received ${results[owner]}.`);
  }
}
