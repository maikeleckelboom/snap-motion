import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots = ["apps", "docs", "e2e", "etc", "fixture-e2e", "fixtures", "packages", "scripts"];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([".nuxt", ".output", "dist", "node_modules"]);

async function textFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return textFiles(path);
      return textExtensions.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = (await Promise.all(roots.map((root) => textFiles(resolve(repositoryRoot, root)))))
  .flat()
  .toSorted();
const unexpectedBoms: string[] = [];

for (const file of files) {
  const contents = await readFile(file);
  if (
    contents.length >= 3 &&
    contents[0] === 0xef &&
    contents[1] === 0xbb &&
    contents[2] === 0xbf
  ) {
    unexpectedBoms.push(relative(repositoryRoot, file).replaceAll("\\", "/"));
  }
}

if (unexpectedBoms.length > 0) {
  throw new Error(`Unexpected UTF-8 BOMs:\n- ${unexpectedBoms.join("\n- ")}`);
}

process.stdout.write(
  `Text hygiene passed for ${files.length} source, API, and documentation files.\n`,
);
