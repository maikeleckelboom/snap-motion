import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyGitHubEvent,
  classifyGitRange,
  ownerLabels,
  repositoryGitCommand,
  verificationOwners,
  type BrowserChangeClassification,
  type VerificationOwner,
} from "./browser-change-classifier.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");

const outputNames: Record<VerificationOwner, string> = {
  packageAuthorityRequired: "package_authority_required",
  linuxVerificationRequired: "linux_verification_required",
  windowsPortabilityRequired: "windows_portability_required",
  browserRequired: "browser_required",
  packageIntegrationRequired: "package_integration_required",
};

function readEventPayload(path: string | undefined): unknown {
  if (path === undefined) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function rangeArguments(arguments_: readonly string[]): { base: string; head: string } | undefined {
  if (arguments_.length === 0) return undefined;
  if (
    arguments_.length === 4 &&
    arguments_[0] === "--base" &&
    arguments_[2] === "--head" &&
    arguments_[1] !== undefined &&
    arguments_[3] !== undefined
  ) {
    return { base: arguments_[1], head: arguments_[3] };
  }
  throw new Error("Usage: node scripts/classify-browser-change.ts [--base <sha> --head <sha>]");
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function outputLines(classification: BrowserChangeClassification): string[] {
  return [
    ...verificationOwners.map((owner) => `${outputNames[owner]}=${classification[owner]}`),
    `full_source_certification=${classification.fullSourceCertification}`,
    `reason=${singleLine(classification.reason)}`,
  ];
}

function ownerSummary(
  classification: BrowserChangeClassification,
  owner: VerificationOwner,
): string {
  if (!classification[owner]) return `${ownerLabels[owner]}: skipped`;
  const triggers = classification.triggers[owner];
  if (triggers.length === 0) return `${ownerLabels[owner]}: required (fail-closed)`;
  const shown = triggers
    .slice(0, 3)
    .map((path) => `\`${path}\``)
    .join(", ");
  const more = triggers.length > 3 ? ` +${triggers.length - 3} more` : "";
  return `${ownerLabels[owner]}: required (${shown}${more})`;
}

function publishGitHubOutputs(classification: BrowserChangeClassification) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined)
    appendFileSync(outputPath, `${outputLines(classification).join("\n")}\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined) {
    const paths =
      classification.changedPaths.length === 0
        ? "- Changed paths unavailable; classification failed closed."
        : classification.changedPaths.map((path) => `- \`${path}\``).join("\n");
    appendFileSync(
      summaryPath,
      [
        "## Verification ownership",
        "",
        ...verificationOwners.map((owner) => `- ${ownerSummary(classification, owner)}`),
        "",
        `Reason: ${singleLine(classification.reason)}`,
        "",
        "### Changed paths",
        "",
        paths,
        "",
      ].join("\n"),
    );
  }
}

const range = rangeArguments(process.argv.slice(2));
const git = repositoryGitCommand(repositoryRoot);
const classification =
  range === undefined
    ? classifyGitHubEvent({
        eventName: process.env.GITHUB_EVENT_NAME,
        eventPayload: readEventPayload(process.env.GITHUB_EVENT_PATH),
        git,
        githubSha: process.env.GITHUB_SHA,
      })
    : classifyGitRange(range.base, range.head, git);

process.stdout.write(
  `${[...outputLines(classification), `changed_paths=${classification.changedPaths.length}`].join("\n")}\n`,
);
publishGitHubOutputs(classification);
