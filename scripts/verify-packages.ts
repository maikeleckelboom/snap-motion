import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { packedText, readPackedArchive, type PackedArchive } from "./packedArchive.ts";
import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts/packages");
const fixtureDirectory = resolve(repoRoot, "fixtures/packed-consumers");
const coreFixtureDirectory = resolve(repoRoot, "fixtures/packed-core-consumer");
const pnpm = resolveRepositoryPnpm(repoRoot);
const workspaceManifest = await readFile(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8");

function workspaceVersion(pattern: RegExp, label: string): string {
  const version = workspaceManifest.match(pattern)?.[1];
  if (!version) throw new Error(`Could not resolve ${label} from pnpm-workspace.yaml.`);
  return version;
}

const consumerCompilerVersions = {
  typescript6: workspaceVersion(
    /^\s{4}typescript: npm:@typescript\/typescript6@([^\s]+)$/m,
    "the TypeScript 6 bridge version",
  ),
  typescript7: workspaceVersion(/^\s{2}typescript: ([^\s]+)$/m, "the TypeScript 7 version"),
  vueTsc: workspaceVersion(/^\s{2}vue-tsc: ([^\s]+)$/m, "the vue-tsc version"),
} as const;

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly name?: string;
  readonly version?: string;
}

function runCommand(command: string, args: readonly string[], cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw result.error ?? new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function runPnpm(args: readonly string[], cwd = repoRoot) {
  runPnpmSync(pnpm, args, { cwd });
}

function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

function inspectPackedFiles(tarball: string, manifest: PackageManifest, entries: PackedArchive) {
  const name = basename(tarball);
  for (const target of exportTargets(manifest.exports)) {
    const packedTarget = `package/${target.replace(/^\.\//, "")}`;
    if (!entries.has(packedTarget)) {
      throw new Error(`${name} export target does not exist: ${target}`);
    }
  }

  const distFiles = [...entries.keys()].filter((entry) => entry.startsWith("package/dist/"));
  if (manifest.name === "@snap-motion/core") {
    const intended = new Set(["package/dist/index.d.ts", "package/dist/index.js"]);
    const unexpected = distFiles.filter((entry) => !intended.has(entry));
    if (unexpected.length > 0) {
      throw new Error(`${name} contains unintended core artifacts:\n${unexpected.join("\n")}`);
    }
  } else {
    const publicDeclarations = new Set(
      exportTargets(manifest.exports)
        .filter((target) => target.endsWith(".d.ts"))
        .map((target) => `package/${target.replace(/^\.\//, "")}`),
    );
    const unexpected = distFiles.filter((entry) => {
      if (/^package\/dist\/[^/]+\.js$/.test(entry)) return false;
      if (entry === "package/dist/style.css") return false;
      if (entry.endsWith(".d.ts")) return !publicDeclarations.has(entry);
      return true;
    });
    if (unexpected.length > 0) {
      throw new Error(`${name} contains unintended Vue artifacts:\n${unexpected.join("\n")}`);
    }
  }

  for (const declaration of distFiles.filter((entry) => entry.endsWith(".d.ts"))) {
    const source = packedText(entries, declaration);
    if (/(?:from\s*|import\s*\(?\s*)["']\./.test(source)) {
      throw new Error(`${name} declaration contains a relative module edge: ${declaration}`);
    }
    if (/packages[\\/]\w+[\\/]src|@snap-motion\/(?:core|vue)\/src/.test(source)) {
      throw new Error(`${name} declaration contains a source-only alias: ${declaration}`);
    }
  }
}

async function availablePort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No TCP port."));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForUrl(url: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function browserSmoke(cwd: string) {
  const port = await availablePort();
  const server = spawn(
    process.execPath,
    [
      resolve(cwd, "node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd, stdio: "pipe" },
  );
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForUrl(url);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const runtimeFailures: string[] = [];
      page.on("pageerror", (error) => runtimeFailures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeFailures.push(message.text());
      });
      await page.goto(url);
      await page.locator("[data-packed-ready]").waitFor();
      for (const selector of [
        ".snap-motion-carousel",
        ".snap-motion-coverflow",
        ".snap-motion-stacked-deck",
      ]) {
        await page.locator(selector).waitFor();
      }
      await page.getByRole("button", { name: "Next item" }).click();
      await page.locator('[data-packed-ready][data-active-id="two"]').waitFor();
      if (runtimeFailures.length > 0) {
        throw new Error(`Packed Vue runtime failed:\n${runtimeFailures.join("\n")}`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

async function stopServer(server: ReturnType<typeof spawn>) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
}

async function nuxtHydrationSmoke(cwd: string) {
  const port = await availablePort();
  const server = spawn(process.execPath, [resolve(cwd, "nuxt/.output/server/index.mjs")], {
    cwd,
    env: {
      ...process.env,
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(port),
    },
    stdio: "pipe",
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForUrl(url);
    const serverHtml = await fetch(url).then((response) => response.text());
    for (const marker of [
      "data-snap-motion-carousel-root",
      "snap-motion-stacked-deck",
      "snap-motion-coverflow",
      "snap-motion-sheet",
      "snap-motion-media-gallery",
    ]) {
      if (!serverHtml.includes(marker)) {
        throw new Error(`Packed Nuxt SSR omitted ${marker}.`);
      }
    }
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const runtimeFailures: string[] = [];
      page.on("pageerror", (error) => runtimeFailures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" || /hydration|mismatch/i.test(message.text())) {
          runtimeFailures.push(message.text());
        }
      });
      await page.goto(url);
      await page.locator("[data-packed-nuxt-ready]").waitFor();
      await page.waitForTimeout(100);
      if (runtimeFailures.length > 0) {
        throw new Error(`Packed Nuxt hydration failed:\n${runtimeFailures.join("\n")}`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

/**
 * Type-checks the consumer's single-file components against the packed declarations.
 *
 * `tsc` cannot see inside an SFC and a Vite build erases types, so neither of them can tell whether
 * `<StackedDeck :items="screens">` still infers the consumer's own item type and semantic ID union
 * from `items` alone. Only `vue-tsc` compiles the templates, which is the thing the generic
 * components exist to get right — including the uses that are supposed to be rejected.
 */
function certifyTemplateInference(cwd: string) {
  process.stdout.write(`\nCertifying packed SFC generic inference with vue-tsc: ${cwd}\n`);
  runPnpm(["exec", "vue-tsc", "--noEmit", "-p", "tsconfig.vue.json"], cwd);
  process.stdout.write("Packed SFC template inference certified.\n");
}

async function removeConsumer(directory: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { force: true, recursive: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100 * (attempt + 1)));
    }
  }
}

async function createConsumer(
  name: string,
  templateName: string,
  coreTarball: string,
  vueTarball: string,
) {
  const directory = await mkdtemp(join(tmpdir(), `snap-motion-${name}-`));
  await cp(fixtureDirectory, directory, { recursive: true });
  const template = await readFile(resolve(directory, templateName), "utf8");
  const packageJson = template
    .replaceAll("__CORE_TARBALL__", coreTarball.replaceAll("\\", "/"))
    .replaceAll("__VUE_TARBALL__", vueTarball.replaceAll("\\", "/"))
    .replaceAll("__TYPESCRIPT6_VERSION__", consumerCompilerVersions.typescript6)
    .replaceAll("__TYPESCRIPT7_VERSION__", consumerCompilerVersions.typescript7)
    .replaceAll("__VUE_TSC_VERSION__", consumerCompilerVersions.vueTsc);
  await writeFile(resolve(directory, "package.json"), packageJson);
  const workspaceTemplate = await readFile(
    resolve(directory, "pnpm-workspace.template.yaml"),
    "utf8",
  );
  await writeFile(
    resolve(directory, "pnpm-workspace.yaml"),
    workspaceTemplate.replaceAll("__CORE_TARBALL__", coreTarball.replaceAll("\\", "/")),
  );
  return directory;
}

async function createCoreConsumer(coreTarball: string) {
  const directory = await mkdtemp(join(tmpdir(), "snap-motion-core-"));
  await cp(coreFixtureDirectory, directory, { recursive: true });
  const template = await readFile(resolve(directory, "package.template.json"), "utf8");
  await writeFile(
    resolve(directory, "package.json"),
    template
      .replaceAll("__CORE_TARBALL__", coreTarball.replaceAll("\\", "/"))
      .replaceAll("__TYPESCRIPT7_VERSION__", consumerCompilerVersions.typescript7),
  );
  return directory;
}

runPnpm(["pack:packages"]);
const artifacts = (await readdir(artifactsDirectory)).filter((file) => file.endsWith(".tgz"));
const coreArtifact = artifacts.find((file) => file.startsWith("snap-motion-core-"));
const vueArtifact = artifacts.find((file) => file.startsWith("snap-motion-vue-"));
if (!coreArtifact || !vueArtifact) throw new Error("Expected core and Vue tarballs.");
const coreTarball = resolve(artifactsDirectory, coreArtifact);
const vueTarball = resolve(artifactsDirectory, vueArtifact);

const packedManifests = new Map<string, PackageManifest>();
for (const tarball of [coreTarball, vueTarball]) {
  process.stdout.write(`\nPacked contents: ${basename(tarball)}\n`);
  const entries = await readPackedArchive(tarball);
  process.stdout.write(`${[...entries.keys()].join("\n")}\n`);
  const manifestSource = packedText(entries, "package/package.json");
  if (manifestSource.includes("workspace:")) {
    throw new Error(`${basename(tarball)} contains a workspace protocol.`);
  }
  const manifest = JSON.parse(manifestSource) as PackageManifest;
  if (manifest.name) packedManifests.set(manifest.name, manifest);
  inspectPackedFiles(tarball, manifest, entries);
  runPnpm(["exec", "publint", "run", tarball, "--strict"]);
  const attwArguments = ["exec", "attw", tarball, "--profile", "esm-only", "--format", "table"];
  if (tarball === vueTarball) {
    attwArguments.push(
      "--exclude-entrypoints",
      "./style.css",
      // The package is ESM-only and the supported Node16/bundler resolutions remain mandatory.
      // Self-subpath type imports intentionally fail the legacy node10 probe; the clean consumer
      // compilations below still hard-fail every supported resolution.
      "--ignore-rules",
      "internal-resolution-error",
      "no-resolution",
    );
  }
  runPnpm(attwArguments);
}

const packedCoreManifest = packedManifests.get("@snap-motion/core");
const packedVueManifest = packedManifests.get("@snap-motion/vue");
const expectedCoreRange = packedCoreManifest?.version
  ? `^${packedCoreManifest.version}`
  : undefined;
if (
  expectedCoreRange === undefined ||
  packedVueManifest?.dependencies?.["@snap-motion/core"] !== expectedCoreRange
) {
  throw new Error(
    `Packed Vue core dependency must be ${expectedCoreRange ?? "derived from the packed core version"}; received ${packedVueManifest?.dependencies?.["@snap-motion/core"] ?? "nothing"}.`,
  );
}

function assertVueOnlyConsumer(manifest: PackageManifest) {
  if (manifest.dependencies?.["@snap-motion/core"] !== undefined) {
    throw new Error("An ordinary Vue consumer must not declare @snap-motion/core directly.");
  }
}

const consumers = [];
try {
  const core = await createCoreConsumer(coreTarball);
  consumers.push(core);
  runPnpm(["install", "--ignore-scripts"], core);
  runPnpm(["exec", "tsc", "-p", "tsconfig.json"], core);
  runCommand(process.execPath, ["runtime.mjs"], core);

  const minimum = await createConsumer(
    "minimum",
    "minimum-package.template.json",
    coreTarball,
    vueTarball,
  );
  consumers.push(minimum);
  const minimumManifest = JSON.parse(
    await readFile(resolve(minimum, "package.json"), "utf8"),
  ) as PackageManifest;
  assertVueOnlyConsumer(minimumManifest);
  runPnpm(["install", "--ignore-scripts"], minimum);
  certifyTemplateInference(minimum);
  runPnpm(["exec", "vite", "build"], minimum);
  runCommand(process.execPath, ["ssr.mjs"], minimum);
  await browserSmoke(minimum);

  const typescript7 = await createConsumer(
    "typescript7",
    "typescript7-package.template.json",
    coreTarball,
    vueTarball,
  );
  consumers.push(typescript7);
  assertVueOnlyConsumer(
    JSON.parse(await readFile(resolve(typescript7, "package.json"), "utf8")) as PackageManifest,
  );
  runPnpm(["install", "--ignore-scripts"], typescript7);
  for (const resolution of ["bundler", "node16", "nodenext"]) {
    runPnpm(["exec", "tsc", "-p", `tsconfig.${resolution}.json`], typescript7);
  }

  const current = await createConsumer("current", "package.template.json", coreTarball, vueTarball);
  consumers.push(current);
  assertVueOnlyConsumer(
    JSON.parse(await readFile(resolve(current, "package.json"), "utf8")) as PackageManifest,
  );
  runPnpm(["install", "--ignore-scripts"], current);
  runPnpm(["exec", "nuxt", "build", "nuxt"], current);
  await nuxtHydrationSmoke(current);
} finally {
  await Promise.all(consumers.map(removeConsumer));
}

process.stdout.write(
  "Packed package certification passed for the direct Core consumer, TypeScript 7 declaration consumer, minimum-Vue SFC/Vite/SSR runtime, and current-Vue Nuxt build and hydration consumer.\n",
);
