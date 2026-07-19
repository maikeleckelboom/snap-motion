import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const coreRoot = resolve(repoRoot, "packages/core/src");
const vueRoot = resolve(repoRoot, "packages/vue/src");
const errors = [];
const sourceFiles = [];
const importGraph = new Map();
const semanticExtensions = new Set([".css", ".json", ".svg", ".vue"]);
const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const featureNames = new Set(["bottom-sheet", "carousel", "dialog", "localization", "motion"]);

async function walk(directory, predicate = () => true) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (
        entry.isDirectory() &&
        new Set([".nuxt", ".output", "dist", "node_modules"]).has(entry.name)
      ) {
        return [];
      }
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path, predicate);
      return predicate(path) ? [path] : [];
    }),
  );
  return nested.flat();
}

function repoPath(path) {
  return relative(repoRoot, path).split(sep).join("/");
}

function sourceSpecifierList(source) {
  const specifiers = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

async function resolveRelativeImport(importer, specifier) {
  const base = resolve(importer, "..", specifier);
  const extension = extname(specifier);
  const candidates = extension
    ? [base]
    : [base, `${base}.ts`, `${base}.vue`, resolve(base, "index.ts")];
  const available = new Set(sourceFiles);
  return candidates.find((candidate) => available.has(candidate));
}

function vueArea(path) {
  const local = relative(vueRoot, path).split(sep);
  return local.length > 1 ? local[0] : "root";
}

function allowedFeatureDependency(importer, target) {
  const from = vueArea(importer);
  const to = vueArea(target);
  if (from === to || to === "internal" || from === "root") return true;
  const targetPath = relative(vueRoot, target).split(sep).join("/");
  if (to === "localization" && targetPath === "localization/messages.ts") return true;
  if (
    (from === "carousel" || from === "bottom-sheet") &&
    to === "motion" &&
    ["motion/motion-contracts.ts", "motion/use-snap-motion.ts"].includes(targetPath)
  ) {
    return true;
  }
  if (from === "bottom-sheet" && to === "dialog" && targetPath === "dialog/dialog-contracts.ts") {
    return true;
  }
  return false;
}

sourceFiles.push(
  ...(await walk(coreRoot, (path) => path.endsWith(".ts"))),
  ...(await walk(vueRoot, (path) => path.endsWith(".ts") || path.endsWith(".vue"))),
);

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const dependencies = [];
  for (const specifier of sourceSpecifierList(source)) {
    if (!specifier.startsWith(".")) {
      if (file.startsWith(coreRoot)) {
        errors.push(
          `${repoPath(file)} imports external runtime ${specifier}; core must stay independent.`,
        );
      }
      continue;
    }

    const extension = extname(specifier);
    if (codeExtensions.has(extension)) {
      errors.push(`${repoPath(file)} uses forbidden TypeScript-relative extension: ${specifier}`);
    } else if (extension && !semanticExtensions.has(extension)) {
      errors.push(`${repoPath(file)} uses an unclassified relative import extension: ${specifier}`);
    }

    const target = await resolveRelativeImport(file, specifier);
    if (!target) {
      errors.push(`${repoPath(file)} has an unresolved relative import: ${specifier}`);
      continue;
    }
    dependencies.push(target);

    if (file.startsWith(vueRoot) && target.startsWith(vueRoot)) {
      const from = vueArea(file);
      const to = vueArea(target);
      if (from === "internal" && featureNames.has(to)) {
        errors.push(`${repoPath(file)} reverses the internal-to-feature dependency direction.`);
      } else if (
        featureNames.has(from) &&
        featureNames.has(to) &&
        !allowedFeatureDependency(file, target)
      ) {
        errors.push(
          `${repoPath(file)} reaches into another feature implementation: ${repoPath(target)}`,
        );
      }
    }
  }
  importGraph.set(file, dependencies);
}

const visiting = new Set();
const visited = new Set();
function visit(file, path = []) {
  if (visiting.has(file)) {
    const cycleStart = path.indexOf(file);
    errors.push(
      `Circular source dependency: ${[...path.slice(cycleStart), file].map(repoPath).join(" -> ")}`,
    );
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of importGraph.get(file) ?? []) visit(dependency, [...path, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of sourceFiles) visit(file);

const entrypoints = [
  resolve(vueRoot, "index.ts"),
  ...[...featureNames].map((feature) => resolve(vueRoot, feature, "index.ts")),
];
for (const entrypoint of entrypoints) {
  const source = await readFile(entrypoint, "utf8");
  if (/\bexport\s+\*/.test(source)) {
    errors.push(`${repoPath(entrypoint)} uses an uncurated wildcard export.`);
  }
}

for (const banned of ["common", "helpers", "shared", "utils"]) {
  try {
    await readdir(resolve(vueRoot, banned));
    errors.push(`packages/vue/src/${banned} is a prohibited generic ownership directory.`);
  } catch {}
}

for (const scope of ["apps", "fixtures"]) {
  const files = await walk(resolve(repoRoot, scope), (path) =>
    /\.(?:js|json|mjs|ts|vue)$/.test(path),
  );
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/packages[\\/]\w+[\\/]src|@snap-motion\/(?:core|vue)\/src/.test(source)) {
      errors.push(
        `${repoPath(file)} consumes a package source path instead of a package entrypoint.`,
      );
    }
  }
}

const vueManifest = JSON.parse(
  await readFile(resolve(repoRoot, "packages/vue/package.json"), "utf8"),
);
for (const subpath of Object.keys(vueManifest.exports)) {
  if (subpath.includes("internal") || subpath.includes("*")) {
    errors.push(`packages/vue/package.json exposes an internal or wildcard subpath: ${subpath}`);
  }
}

if (errors.length > 0) {
  throw new Error(`Architecture checks failed:\n- ${errors.join("\n- ")}`);
}

process.stdout.write(
  `Architecture checks passed for ${sourceFiles.length} package source modules with an acyclic dependency graph.\n`,
);
