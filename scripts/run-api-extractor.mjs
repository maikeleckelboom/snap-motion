import { resolve } from "node:path";

import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const repoRoot = resolve(import.meta.dirname, "..");
const mode = process.argv.find((argument) => argument.startsWith("--mode="))?.slice(7) ?? "check";
const packageFilter = process.argv.find((argument) => argument.startsWith("--package="))?.slice(10);

if (!["check", "rollup", "update"].includes(mode)) {
  throw new Error(`Unknown API Extractor mode: ${mode}`);
}
if (packageFilter && !["core", "vue"].includes(packageFilter)) {
  throw new Error(`Unknown API Extractor package: ${packageFilter}`);
}

const configurations = [
  { packageName: "core", path: "packages/core/api-extractor.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.carousel.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.bottom-sheet.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.dialog.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.localization.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.motion.json" },
].filter((configuration) => !packageFilter || configuration.packageName === packageFilter);

let failed = false;
for (const configuration of configurations) {
  const configPath = resolve(repoRoot, configuration.path);
  const configObject = ExtractorConfig.loadFile(configPath);
  if (mode === "rollup") {
    configObject.apiReport = { ...configObject.apiReport, enabled: false };
  }
  const extractorConfig = ExtractorConfig.prepare({
    configObject,
    configObjectFullPath: configPath,
    packageJsonFullPath: resolve(repoRoot, `packages/${configuration.packageName}/package.json`),
  });
  const result = Extractor.invoke(extractorConfig, {
    localBuild: mode === "update",
    printApiReportDiff: mode === "check",
    showVerboseMessages: false,
  });
  failed ||= !result.succeeded;
}

if (failed) process.exitCode = 1;
