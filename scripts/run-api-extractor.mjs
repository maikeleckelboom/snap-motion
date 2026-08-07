import { resolve } from "node:path";

import { ConsoleMessageId, Extractor, ExtractorConfig } from "@microsoft/api-extractor";

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
  { packageName: "vue", path: "packages/vue/api-extractor.sheet.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.dialog.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.localization.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.media-gallery.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.motion.json" },
].filter((configuration) => !packageFilter || configuration.packageName === packageFilter);

/**
 * API Extractor deliberately analyses with its own bundled TypeScript rather than the workspace
 * compiler, and announces that once per configuration. Eight entrypoints therefore produce the same
 * two lines eight times. The supported `messageCallback` hook routes exactly those two console
 * messages here so the runner can state the situation once; every extractor, compiler, TSDoc, and
 * API-report diagnostic keeps its normal reporting.
 */
const deduplicatedNotices = new Set([
  ConsoleMessageId.Preamble,
  ConsoleMessageId.CompilerVersionNotice,
]);
let compilerEngineNoticeReported = false;

function messageCallback(message) {
  if (!deduplicatedNotices.has(message.messageId)) return;
  message.handled = true;
  if (
    message.messageId !== ConsoleMessageId.CompilerVersionNotice ||
    compilerEngineNoticeReported
  ) {
    return;
  }
  compilerEngineNoticeReported = true;
  process.stdout.write(
    "API Extractor: bundled TS engine differs from workspace TS; using the supported extractor engine.\n",
  );
}

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
    messageCallback,
    printApiReportDiff: mode === "check",
    showVerboseMessages: false,
  });
  failed ||= !result.succeeded;
}

if (failed) process.exitCode = 1;
