import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { resolveRepositoryPnpm, runPnpmSync } from "./pnpm-cli.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts/packages");
const fixtureDirectory = resolve(repoRoot, "fixtures/packed-consumers");
const pnpm = resolveRepositoryPnpm(repoRoot);
const workspaceManifest = await readFile(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8");

function workspaceVersion(pattern: RegExp, label: string): string {
  const version = workspaceManifest.match(pattern)?.[1];
  if (!version) throw new Error(`Could not resolve ${label} from pnpm-workspace.yaml.`);
  return version;
}

const typescript6Version = workspaceVersion(
  /^\s{4}typescript: npm:@typescript\/typescript6@([^\s]+)$/m,
  "the TypeScript 6 bridge version",
);
const vueTscVersion = workspaceVersion(/^\s{2}vue-tsc: ([^\s]+)$/m, "the vue-tsc version");

function runPnpm(args: readonly string[], cwd = repoRoot): void {
  runPnpmSync(pnpm, args, { cwd });
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

async function waitForUrl(url: string): Promise<void> {
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

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
}

async function certifyNuxtHydration(cwd: string): Promise<void> {
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
      await page.evaluate(
        () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
      );
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

async function removeConsumer(directory: string): Promise<void> {
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

const artifacts = (await readdir(artifactsDirectory)).filter((file) => file.endsWith(".tgz"));
const coreArtifact = artifacts.find((file) => file.startsWith("snap-motion-core-"));
const vueArtifact = artifacts.find((file) => file.startsWith("snap-motion-vue-"));
if (!coreArtifact || !vueArtifact) {
  throw new Error(
    "Expected prepared Core and Vue tarballs. Run pnpm pack:packages:prepared first.",
  );
}

const consumer = await mkdtemp(join(tmpdir(), "snap-motion-current-"));
try {
  await cp(fixtureDirectory, consumer, { recursive: true });
  const coreTarball = resolve(artifactsDirectory, coreArtifact).replaceAll("\\", "/");
  const vueTarball = resolve(artifactsDirectory, vueArtifact).replaceAll("\\", "/");
  const packageTemplate = await readFile(resolve(consumer, "package.template.json"), "utf8");
  const packageSource = packageTemplate
    .replaceAll("__VUE_TARBALL__", vueTarball)
    .replaceAll("__TYPESCRIPT6_VERSION__", typescript6Version)
    .replaceAll("__VUE_TSC_VERSION__", vueTscVersion);
  const packageManifest = JSON.parse(packageSource) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  if (packageManifest.dependencies?.["@snap-motion/core"] !== undefined) {
    throw new Error("The packed Nuxt consumer must not declare @snap-motion/core directly.");
  }
  await writeFile(resolve(consumer, "package.json"), packageSource);
  const workspaceTemplate = await readFile(
    resolve(consumer, "pnpm-workspace.template.yaml"),
    "utf8",
  );
  await writeFile(
    resolve(consumer, "pnpm-workspace.yaml"),
    workspaceTemplate.replaceAll("__CORE_TARBALL__", coreTarball),
  );

  runPnpm(["install", "--ignore-scripts"], consumer);
  runPnpm(["exec", "nuxt", "build", "nuxt"], consumer);
  await certifyNuxtHydration(consumer);
} finally {
  await removeConsumer(consumer);
}

process.stdout.write("Packed Nuxt build, SSR, and Chromium hydration certification passed.\n");
