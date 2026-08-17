import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const playwrightCli = resolve(repositoryRoot, "node_modules/@playwright/test/cli.js");
const projects = ["chromium", "firefox", "webkit", "webkit-stacked-deck"] as const;
const shardTotal = 2;

function listIdentities(project: string, shard?: number): readonly string[] {
  const cliArguments = [playwrightCli, "test", "--list", `--project=${project}`];
  if (shard !== undefined) cliArguments.push(`--shard=${shard}/${shardTotal}`);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "FORCE_COLOR"),
  );
  const output = execFileSync(process.execPath, cliArguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...environment, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split(/\r?\n/).flatMap((line) => {
    const match = /^\s+\[(?<project>[^\]]+)]\s+›\s+(?<file>.+?):\d+:\d+\s+›\s+(?<title>.+)$/.exec(
      line,
    );
    if (match?.groups === undefined) return [];
    const { file, project: listedProject, title } = match.groups;
    if (file === undefined || listedProject === undefined || title === undefined) return [];
    return [`${listedProject}|${file.replaceAll("\\", "/")}|${title}`];
  });
}

function identityHash(identities: readonly string[]): string {
  return createHash("sha256").update(identities.toSorted().join("\n")).digest("hex");
}

function difference(left: readonly string[], right: ReadonlySet<string>): readonly string[] {
  return left.filter((identity) => !right.has(identity));
}

for (const project of projects) {
  const full = listIdentities(project);
  const shards = Array.from({ length: shardTotal }, (_, index) =>
    listIdentities(project, index + 1),
  );
  const union = shards.flat();
  const fullSet = new Set(full);
  const unionSet = new Set(union);
  const missing = difference(full, unionSet);
  const unexpected = difference(union, fullSet);
  const duplicateCounts = new Map<string, number>();
  for (const identity of union) {
    duplicateCounts.set(identity, (duplicateCounts.get(identity) ?? 0) + 1);
  }
  const duplicates = [...duplicateCounts.values()].filter((count) => count !== 1);

  if (
    full.length !== fullSet.size ||
    union.length !== unionSet.size ||
    missing.length > 0 ||
    unexpected.length > 0 ||
    duplicates.length > 0
  ) {
    throw new Error(
      [
        `Browser shard coverage mismatch for ${project}.`,
        `full=${full.length}/${fullSet.size} unique`,
        `union=${union.length}/${unionSet.size} unique`,
        `missing=${missing.length}`,
        `unexpected=${unexpected.length}`,
        `duplicates=${duplicates.length}`,
      ].join(" "),
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      project,
      full: full.length,
      shards: shards.map((identities) => identities.length),
      sha256: identityHash(full),
    })}\n`,
  );
}

process.stdout.write("Browser shard inventory matches every complete project exactly.\n");
