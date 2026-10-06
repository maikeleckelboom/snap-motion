import { appendFile, writeFile } from "node:fs/promises";

import { assertBrowserCertification, isFullSourceCertification } from "./browserCertification.ts";
import { inspectReleasePackages } from "./release-package-assembly.ts";

const env = process.env;
const requirements = {
  packages: env.PACKAGE_AUTHORITY_REQUIRED,
  linux: env.LINUX_REQUIRED,
  windows: env.WINDOWS_REQUIRED,
  browser: env.BROWSER_REQUIRED,
  integration: env.PACKAGE_INTEGRATION_REQUIRED,
};
assertBrowserCertification(requirements, {
  admission: env.ADMISSION_RESULT,
  packages: env.PACKAGE_RESULT,
  metadataFormat: env.METADATA_FORMAT_RESULT,
  linux: env.LINUX_RESULT,
  windows: env.WINDOWS_RESULT,
  chromium: env.CHROMIUM_RESULT,
  interoperability: env.CROSS_BROWSER_RESULT,
  integration: env.INTEGRATION_RESULT,
});
const full = isFullSourceCertification(requirements);
const message = `Verification certification passed: ${JSON.stringify(requirements)}, full source certification=${full}. ${env.SCOPE_REASON ?? ""}`;
if (env.GITHUB_STEP_SUMMARY)
  await appendFile(env.GITHUB_STEP_SUMMARY, `## Browser certification\n\n${message}\n`);
process.stdout.write(`${message}\n`);
if (full) {
  if (
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? "") ||
    !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") ||
    !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")
  )
    throw new Error("Full source evidence requires an exact GitHub run identity.");
  await writeFile(
    ".artifacts/packages/source-verification.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repository: env.GITHUB_REPOSITORY,
        sourceCommit: env.GITHUB_SHA,
        runId: Number(env.GITHUB_RUN_ID),
        runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
        packages: await inspectReleasePackages(".artifacts/packages"),
      },
      null,
      2,
    )}\n`,
  );
}
