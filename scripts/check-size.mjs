import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const repoRoot = resolve(import.meta.dirname, "..");
const budgets = JSON.parse(await readFile(resolve(repoRoot, "config/size-budgets.json"), "utf8"));

async function collectStaticGraph(entryPath, visited = new Set()) {
  const resolvedPath = resolve(entryPath);
  if (visited.has(resolvedPath)) return [];
  visited.add(resolvedPath);
  const source = await readFile(resolvedPath);
  const text = source.toString("utf8");
  const imports = [...text.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g)].map(
    (match) => resolve(dirname(resolvedPath), match[1]),
  );
  const dependencies = (
    await Promise.all(imports.map((item) => collectStaticGraph(item, visited)))
  ).flat();
  return [{ path: resolvedPath, source }, ...dependencies];
}

const measurements = {};
const forbiddenEntryEdges = {
  vueCarousel: ["coverflow", "stacked-deck", "sheet", "media-gallery"],
  vueCoverflow: ["stacked-deck", "sheet", "dialog", "media-gallery"],
  vueStackedDeck: ["coverflow", "sheet", "dialog", "media-gallery"],
  vueSheet: ["carousel", "coverflow", "stacked-deck", "media-gallery"],
  vueDialog: ["carousel", "coverflow", "stacked-deck", "sheet", "media-gallery"],
  vueMotion: ["carousel", "coverflow", "stacked-deck", "sheet", "dialog", "media-gallery"],
};
for (const [name, budget] of Object.entries(budgets)) {
  const files = await collectStaticGraph(resolve(repoRoot, budget.entry));
  const source = Buffer.concat(files.map((file) => file.source));
  if (name === "vueMediaGallery") {
    const emittedGraph = source.toString("utf8");
    const forbiddenEdges = [
      ["Motion", /(?:from\s*|import\s*)["']motion["']/],
      ["Snap Motion core", /(?:from\s*|import\s*)["']@snap-motion\/core["']/],
      ["carousel", /carousel/i],
      ["sheet", /(?:from\s*|import\s*)["'][^"']*sheet[^"']*["']/i],
      ["lab", /apps[\\/]lab|@\/|coverflow/i],
      ["Nuxt", /from\s*["'](?:#app|nuxt)/],
      ["router", /from\s*["'](?:vue-router|#vue-router)/],
    ].filter(([, pattern]) => pattern.test(emittedGraph));
    if (forbiddenEdges.length > 0) {
      throw new Error(
        `vueMediaGallery contains forbidden emitted edges: ${forbiddenEdges
          .map(([label]) => label)
          .join(", ")}`,
      );
    }
  }
  const forbiddenFeatures = forbiddenEntryEdges[name] ?? [];
  const emittedImports = files
    .flatMap((file) => [
      basename(file.path),
      ...file.source.toString("utf8").matchAll(/from["']([^"']+)["']/g),
    ])
    .join("\n");
  const leakedFeatures = forbiddenFeatures.filter((feature) => emittedImports.includes(feature));
  if (leakedFeatures.length > 0) {
    throw new Error(`${name} pulls unrelated feature chunks: ${leakedFeatures.join(", ")}`);
  }
  const result = {
    bytes: source.byteLength,
    files: files.map((file) => basename(file.path)),
    gzipBytes: gzipSync(source, { level: 9 }).byteLength,
  };
  measurements[name] = result;
  if (result.bytes > budget.maxBytes || result.gzipBytes > budget.maxGzipBytes) {
    throw new Error(
      `${name} exceeds its size budget: ${result.bytes}/${budget.maxBytes} bytes, ${result.gzipBytes}/${budget.maxGzipBytes} gzip bytes`,
    );
  }
}

process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
