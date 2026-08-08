import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { packedText, readPackedArchive, type PackedArchive } from "./packedArchive.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts/packages");
const fixtureDirectory = resolve(repoRoot, "fixtures/packed-consumers");
const coreFixtureDirectory = resolve(repoRoot, "fixtures/packed-core-consumer");
const pnpmCommand = "pnpm";
const pnpmCli = resolve(dirname(process.execPath), "node_modules/corepack/dist/pnpm.js");

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly name?: string;
  readonly version?: string;
}

function run(command: string, args: readonly string[], cwd = repoRoot) {
  const usesWindowsCorepack = process.platform === "win32" && command === pnpmCommand;
  const resolvedCommand = usesWindowsCorepack ? process.execPath : command;
  const resolvedArguments = usesWindowsCorepack ? [pnpmCli, ...args] : args;
  const result = spawnSync(resolvedCommand, resolvedArguments, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw result.error ?? new Error(`${command} ${args.join(" ")} failed.`);
  }
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
      const carousel = page.locator(".snap-motion-carousel");
      const viewport = page.locator(".snap-motion-carousel-viewport");
      const track = page.locator(".snap-motion-carousel-track");
      const slide = page.locator(".snap-motion-carousel-slide").first();
      const directions = async () =>
        page.evaluate(
          ([root, physicalTrack, content]) => [
            getComputedStyle(root).direction,
            getComputedStyle(physicalTrack).direction,
            getComputedStyle(content).direction,
          ],
          [
            await carousel.elementHandle(),
            await track.elementHandle(),
            await slide.elementHandle(),
          ],
        );
      if (JSON.stringify(await directions()) !== JSON.stringify(["ltr", "ltr", "ltr"])) {
        throw new Error("Packed carousel started with an incoherent LTR direction contract.");
      }

      await page.getByRole("button", { name: "Select overview surfaces" }).click();
      await page.locator('[data-packed-ready][data-deck-id="overview"]').waitFor();
      await page.locator('[data-packed-ready][data-coverflow-id="overview"]').waitFor();
      const deck = page.locator(".snap-motion-stacked-deck");
      const coverflow = page.locator(".snap-motion-coverflow");
      await deck.press("ArrowRight");
      await page.locator('[data-packed-ready][data-deck-id="system"]').waitFor();
      await coverflow.press("ArrowRight");
      await page.locator('[data-packed-ready][data-coverflow-id="system"]').waitFor();

      await page.getByRole("button", { name: "Next item" }).click();
      await page.locator('[data-packed-ready][data-active-id="two"]').waitFor();
      await page.getByRole("button", { name: "Previous item" }).click();
      await page.locator('[data-packed-ready][data-active-id="one"]').waitFor();
      await viewport.press("ArrowRight");
      await page.locator('[data-packed-ready][data-active-id="two"]').waitFor();
      await page.getByRole("button", { name: "Toggle direction" }).click();
      await page.locator("[data-packed-ready][data-direction='rtl']").waitFor();
      const rtlDirections = await directions();
      if (JSON.stringify(rtlDirections) !== JSON.stringify(["rtl", "ltr", "rtl"])) {
        throw new Error(
          `Packed carousel did not update content direction while keeping its rail LTR: ${JSON.stringify(rtlDirections)}.`,
        );
      }
      await viewport.press("ArrowRight");
      await page.locator('[data-packed-ready][data-active-id="one"]').waitFor();

      const viewportBox = await viewport.boundingBox();
      if (!viewportBox) throw new Error("Packed carousel viewport is not rendered.");
      const pointerY = viewportBox.y + viewportBox.height * 0.5;
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.15, pointerY);
      await page.mouse.down();
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.9, pointerY, {
        steps: 8,
      });
      const pointerTransform = await track.evaluate(
        (element) => getComputedStyle(element).transform,
      );
      const pointerPhase = await viewport.getAttribute("data-phase");
      await page.mouse.up();
      await page.waitForTimeout(100);
      const pointerTarget = await page
        .locator("[data-packed-ready]")
        .getAttribute("data-active-id");
      if (pointerTarget !== "two") {
        throw new Error(
          `Packed RTL pointer drag resolved to ${pointerTarget ?? "no semantic target"} instead of two (phase ${pointerPhase ?? "unknown"}, transform ${pointerTransform}).`,
        );
      }
      await viewport.hover();
      await page.mouse.wheel(200, 0);
      await page.locator('[data-packed-ready][data-active-id="one"]').waitFor();

      const deckCard = page.locator(
        ".snap-motion-stacked-deck-card[aria-current='true'] .packed-screen",
      );
      const deckBox = await deckCard.boundingBox();
      if (!deckBox) throw new Error("Packed stacked deck card is not rendered.");
      await page.mouse.move(deckBox.x + deckBox.width * 0.7, deckBox.y + deckBox.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(deckBox.x + deckBox.width * 0.25, deckBox.y + deckBox.height * 0.5, {
        steps: 8,
      });
      await page.mouse.up();
      await page.locator("[data-packed-ready][data-card-clicks='0']").waitFor();
      await page.getByRole("button", { name: "Card action" }).first().click();
      await page.locator("[data-packed-ready][data-control-clicks='1']").waitFor();

      await page.getByRole("button", { name: "Open sheet" }).click();
      await page.locator(".snap-motion-sheet").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Close sheet" }).click();
      await page.locator(".snap-motion-sheet").waitFor({ state: "hidden" });

      await page.getByRole("button", { name: "Open gallery" }).click();
      await page.locator(".snap-motion-media-gallery").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Close gallery" }).click();
      await page.locator(".snap-motion-media-gallery").waitFor({ state: "hidden" });
      await page.waitForTimeout(100);
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
  run(pnpmCommand, ["exec", "vue-tsc", "--noEmit", "-p", "tsconfig.vue.json"], cwd);
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
    .replaceAll("__VUE_TARBALL__", vueTarball.replaceAll("\\", "/"));
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
    template.replaceAll("__CORE_TARBALL__", coreTarball.replaceAll("\\", "/")),
  );
  return directory;
}

run(pnpmCommand, ["pack:packages"]);
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
  run(pnpmCommand, ["exec", "publint", "run", tarball, "--strict"]);
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
  run(pnpmCommand, attwArguments);
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
  run(pnpmCommand, ["install", "--ignore-scripts"], core);
  run(pnpmCommand, ["exec", "tsc", "-p", "tsconfig.json"], core);
  run(process.execPath, ["runtime.mjs"], core);

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
  run(pnpmCommand, ["install", "--ignore-scripts"], minimum);
  for (const resolution of ["bundler", "node16", "nodenext"]) {
    run(pnpmCommand, ["exec", "tsc", "-p", `tsconfig.${resolution}.json`], minimum);
  }
  certifyTemplateInference(minimum);
  run(pnpmCommand, ["exec", "vite", "build"], minimum);
  run(process.execPath, ["ssr.mjs"], minimum);
  run(process.execPath, ["media-gallery-import.mjs"], minimum);

  const current = await createConsumer("current", "package.template.json", coreTarball, vueTarball);
  consumers.push(current);
  assertVueOnlyConsumer(
    JSON.parse(await readFile(resolve(current, "package.json"), "utf8")) as PackageManifest,
  );
  run(pnpmCommand, ["install", "--ignore-scripts"], current);
  for (const resolution of ["bundler", "node16", "nodenext"]) {
    run(pnpmCommand, ["exec", "tsc", "-p", `tsconfig.${resolution}.json`], current);
  }
  certifyTemplateInference(current);
  run(pnpmCommand, ["exec", "vite", "build"], current);
  run(process.execPath, ["ssr.mjs"], current);
  run(process.execPath, ["media-gallery-import.mjs"], current);
  run(pnpmCommand, ["exec", "nuxt", "build", "nuxt"], current);
  await browserSmoke(current);
  await nuxtHydrationSmoke(current);
  run(pnpmCommand, ["exec", "nuxt", "generate", "nuxt"], current);
} finally {
  await Promise.all(consumers.map(removeConsumer));
}

process.stdout.write(
  "Packed package certification passed for the direct core consumer and minimum/current Vue-only consumers: ESM, all Vue surfaces, gallery-only import, generic SFC inference, Vite, Router, Nuxt build/generate, SSR, hydration, live direction, pointer, wheel, keyboard, and compatibility-click smoke.\n",
);
