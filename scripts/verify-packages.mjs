import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { chromium } from "@playwright/test";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactsDirectory = resolve(repoRoot, ".artifacts/packages");
const fixtureDirectory = resolve(repoRoot, "fixtures/packed-consumers");
const pnpmCommand = "pnpm";

function run(command, args, cwd = repoRoot, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && command === pnpmCommand,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw result.error ?? new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function capture(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed.`);
  return result.stdout;
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No TCP port."));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForUrl(url) {
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

async function browserSmoke(cwd) {
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
      await page.goto(url);
      await page.locator("[data-packed-ready]").waitFor();
      await page.getByRole("button", { name: "Next item" }).click();
      await page.locator('[data-packed-ready][data-active-id="two"]').waitFor();
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
}

async function nuxtHydrationSmoke(cwd) {
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
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const runtimeFailures = [];
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

async function removeConsumer(directory) {
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

async function createConsumer(name, templateName, coreTarball, vueTarball) {
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

run(pnpmCommand, ["pack:packages"]);
const artifacts = (await readdir(artifactsDirectory)).filter((file) => file.endsWith(".tgz"));
const coreArtifact = artifacts.find((file) => file.startsWith("snap-motion-core-"));
const vueArtifact = artifacts.find((file) => file.startsWith("snap-motion-vue-"));
if (!coreArtifact || !vueArtifact) throw new Error("Expected core and Vue tarballs.");
const coreTarball = resolve(artifactsDirectory, coreArtifact);
const vueTarball = resolve(artifactsDirectory, vueArtifact);

for (const tarball of [coreTarball, vueTarball]) {
  process.stdout.write(`\nPacked contents: ${basename(tarball)}\n`);
  process.stdout.write(`${capture("tar", ["-tf", tarball])}\n`);
  const manifestSource = capture("tar", ["-xOf", tarball, "package/package.json"]);
  if (manifestSource.includes("workspace:")) {
    throw new Error(`${basename(tarball)} contains a workspace protocol.`);
  }
  JSON.parse(manifestSource);
  run(pnpmCommand, ["exec", "publint", "run", tarball, "--strict"]);
  const attwArguments = ["exec", "attw", tarball, "--profile", "esm-only", "--format", "table"];
  if (tarball === vueTarball) attwArguments.push("--exclude-entrypoints", "./style.css");
  run(pnpmCommand, attwArguments);
}

const consumers = [];
try {
  const minimum = await createConsumer(
    "minimum",
    "minimum-package.template.json",
    coreTarball,
    vueTarball,
  );
  consumers.push(minimum);
  run(pnpmCommand, ["install"], minimum);
  for (const resolution of ["bundler", "node16", "nodenext"]) {
    run(pnpmCommand, ["exec", "tsc", "-p", `tsconfig.${resolution}.json`], minimum);
  }
  run(pnpmCommand, ["exec", "vite", "build"], minimum);
  run(process.execPath, ["ssr.mjs"], minimum);

  const current = await createConsumer("current", "package.template.json", coreTarball, vueTarball);
  consumers.push(current);
  run(pnpmCommand, ["install"], current);
  for (const resolution of ["bundler", "node16", "nodenext"]) {
    run(pnpmCommand, ["exec", "tsc", "-p", `tsconfig.${resolution}.json`], current);
  }
  run(pnpmCommand, ["exec", "vite", "build"], current);
  run(process.execPath, ["ssr.mjs"], current);
  run(pnpmCommand, ["exec", "nuxt", "build", "nuxt"], current);
  await browserSmoke(current);
  await nuxtHydrationSmoke(current);
} finally {
  await Promise.all(consumers.map(removeConsumer));
}

process.stdout.write(
  "Packed package certification passed for minimum/current Vue, ESM, Vite, Router, Nuxt, SSR, hydration, and browser smoke consumers.\n",
);
