export interface CertificationRequirements {
  readonly packages: string | undefined;
  readonly linux: string | undefined;
  readonly windows: string | undefined;
  readonly browser: string | undefined;
  readonly integration: string | undefined;
}

export interface CertificationResults {
  readonly admission: string | undefined;
  readonly packages: string | undefined;
  readonly metadataFormat: string | undefined;
  readonly linux: string | undefined;
  readonly windows: string | undefined;
  readonly chromium: string | undefined;
  readonly interoperability: string | undefined;
  readonly integration: string | undefined;
}

/** Owner → the requirement flag that decides it. Metadata format is the cheap stand-in for Linux. */
const ownerRequirements = {
  packages: "packages",
  linux: "linux",
  windows: "windows",
  chromium: "browser",
  interoperability: "browser",
  integration: "integration",
} as const;

export function assertBrowserCertification(
  requirements: CertificationRequirements,
  results: CertificationResults,
): void {
  const flags = Object.values(requirements);
  if (flags.some((flag) => flag !== "true" && flag !== "false"))
    throw new Error("Verification ownership outputs are missing or invalid.");
  const required = (name: keyof CertificationRequirements) => requirements[name] === "true";
  // Dependencies: Linux consumes the authority; browsers/integration consume Linux-verified source.
  if (
    (required("linux") && !required("packages")) ||
    (required("browser") && !required("linux")) ||
    (required("integration") && !required("linux"))
  )
    throw new Error("Verification ownership outputs are incoherent.");

  if (results.admission !== "success")
    throw new Error(`Source authority admission did not succeed: ${results.admission}.`);
  for (const [owner, flag] of Object.entries(ownerRequirements)) {
    const expected = required(flag) ? "success" : "skipped";
    const received = results[owner as keyof typeof ownerRequirements];
    if (received !== expected)
      throw new Error(`Verification owner ${owner}: expected ${expected}, received ${received}.`);
  }
  // Lightweight runs prove formatting of the metadata they changed instead of the Linux suite.
  const formatExpected = required("linux") ? "skipped" : "success";
  if (results.metadataFormat !== formatExpected)
    throw new Error(
      `Verification owner metadataFormat: expected ${formatExpected}, received ${results.metadataFormat}.`,
    );
}

/** The only run shape whose evidence may certify a release candidate. */
export function isFullSourceCertification(requirements: CertificationRequirements): boolean {
  return Object.values(requirements).every((flag) => flag === "true");
}
