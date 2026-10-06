import { appendFile, writeFile } from "node:fs/promises";

import { assertBrowserCertification } from "./browserCertification.ts";
import { inspectReleasePackages } from "./release-package-assembly.ts";

const env = process.env;
assertBrowserCertification(env.BROWSER_REQUIRED, env.PACKAGE_INTEGRATION_REQUIRED, {
  admission: env.ADMISSION_RESULT,
  packages: env.PACKAGE_RESULT,
  linux: env.LINUX_RESULT,
  windows: env.WINDOWS_RESULT,
  chromium: env.CHROMIUM_RESULT,
  interoperability: env.CROSS_BROWSER_RESULT,
  integration: env.INTEGRATION_RESULT,
});
const message = `Browser certification passed: source browsers=${env.BROWSER_REQUIRED}, package integration=${env.PACKAGE_INTEGRATION_REQUIRED}. ${env.SCOPE_REASON ?? ""}`;
if (env.GITHUB_STEP_SUMMARY)
  await appendFile(env.GITHUB_STEP_SUMMARY, `## Browser certification\n\n${message}\n`);
process.stdout.write(`${message}\n`);
if (env.BROWSER_REQUIRED === "true" && env.PACKAGE_INTEGRATION_REQUIRED === "true") {
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
