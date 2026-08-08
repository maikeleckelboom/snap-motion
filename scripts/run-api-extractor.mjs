import { resolve } from "node:path";

import {
  ConsoleMessageId,
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
} from "@microsoft/api-extractor";

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
  // Cross-entrypoint public types retain the module that conceptually owns them. Generate those
  // lower-level rollups before the feature reports that import them so API Extractor resolves the
  // same public package paths a consumer does, rather than requiring every feature to re-export a
  // shared type it does not own.
  { packageName: "vue", path: "packages/vue/api-extractor.motion.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.localization.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.dialog.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.carousel.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.coverflow.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.stacked-deck.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.sheet.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.media-gallery.json" },
  { packageName: "vue", path: "packages/vue/api-extractor.json" },
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

function isGeneratedVueForgottenExport(message) {
  if (
    message.messageId !== "ae-forgotten-export" ||
    !message.sourceFilePath?.replaceAll("\\", "/").includes("/temp/declarations/vue/") ||
    !message.sourceFilePath.endsWith(".d.vue.ts")
  ) {
    return false;
  }

  const symbol = message.text.match(/The symbol "([^"]+)"/)?.[1];
  if (symbol && /^__VLS_(?:WithSlots|base|Slots|PrettifyLocal|Props)(?:_\d+)?$/.test(symbol)) {
    return true;
  }

  return (
    message.sourceFilePath
      .replaceAll("\\", "/")
      .endsWith("/media-gallery/components/MediaGalleryDialog.d.vue.ts") &&
    symbol !== undefined &&
    new Set(["next", "previous", "requestClose", "resetToFit"]).has(symbol)
  );
}

function messageCallback(message) {
  if (isGeneratedVueForgottenExport(message)) {
    // Vue's declaration emitter represents generic components, slots, and defineExpose members
    // through private helper symbols. They cannot be entrypoint exports and are not public API.
    // Suppress only those exact generated names from generated SFC declarations; any forgotten
    // source-owned symbol remains a failing warning below.
    message.logLevel = ExtractorLogLevel.None;
    return;
  }
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
  // Updating a checked-in report is itself reported as a warning. It is expected only in update
  // mode; check and rollup modes still fail on every warning that was not explicitly discarded.
  failed ||= !result.succeeded || (mode !== "update" && result.warningCount > 0);
}

if (failed) process.exitCode = 1;
