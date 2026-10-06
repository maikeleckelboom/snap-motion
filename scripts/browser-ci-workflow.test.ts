import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");

function jobBlock(workflow: string, job: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start < 0) throw new Error(`Workflow job ${job} is missing.`);
  const next = lines.findIndex((line, index) => index > start && /^  [\w-]+:$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join("\n");
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

async function workflowSource(): Promise<string> {
  return readFile(resolve(repositoryRoot, ".github/workflows/verify.yml"), "utf8");
}

describe("Verify browser CI contracts", () => {
  it("admits full history and keeps deterministic verification browser-free", async () => {
    const workflow = await workflowSource();
    const admission = jobBlock(workflow, "repository-admission");
    const linux = jobBlock(workflow, "linux-verification");
    const manifest = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m);
    expect(workflow).not.toContain("changed-files");
    expect(admission).toContain("timeout-minutes: 3");
    expect(admission).toContain("fetch-depth: 0");
    expect(admission).toContain("node scripts/check-release-candidate-history.ts");
    expect(admission).toContain("node scripts/classify-browser-change.ts");
    expect(admission).toContain("browser_required: ${{ steps.classify.outputs.browser_required }}");
    expect(linux).not.toMatch(/playwright|chromium|firefox|webkit/i);
    expect(occurrences(linux, "run: pnpm build:packages")).toBe(1);
    expect(linux).toContain("pnpm typecheck:prepared");
    expect(linux).toContain("pnpm build:apps:prepared");
    expect(linux).toContain("pnpm api:check:prepared");
    expect(linux).toContain("pnpm pack:packages:prepared");
    expect(linux).toContain("pnpm verify:packages:prepared");
    expect(occurrences(manifest.scripts.verify ?? "", "build:packages")).toBe(1);
    expect(manifest.scripts.typecheck).toContain("build:packages");
    expect(manifest.scripts.build).toContain("build:packages");
    expect(manifest.scripts["api:check"]).toContain("build:packages");
    expect(manifest.scripts["verify:packages"]).toContain("build:packages");
    expect(manifest.scripts["verify:packages:browser"]).toContain("build:packages");
  });

  it("runs measured Chromium groups and independent engines with version-matched containers", async () => {
    const workflow = await workflowSource();
    const chromium = jobBlock(workflow, "chromium");
    const crossBrowser = jobBlock(workflow, "cross-browser");
    const workspace = await readFile(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8");
    const playwrightVersion = workspace.match(
      /^\s*"?@playwright\/test"?:\s*(\d+\.\d+\.\d+)\s*$/m,
    )?.[1];
    expect(playwrightVersion).toBeDefined();
    expect(chromium).toContain("group: [general, deck, direct]");
    expect(chromium).toContain("SNAP_MOTION_BROWSER_GROUP:");
    expect(crossBrowser).toContain("project: [firefox, webkit, webkit-stacked-deck]");
    for (const job of [chromium, crossBrowser, jobBlock(workflow, "browser-integration")]) {
      expect(job).toContain("image: mcr.microsoft.com/playwright:v" + playwrightVersion + "-noble");
      expect(job).toContain("options: --user 1001");
      expect(job).not.toMatch(/playwright\s+install(?:-deps)?\b/);
    }
    for (const job of [chromium, crossBrowser]) {
      expect(job).toContain("--workers=2");
      expect(job).not.toContain("--shard=");
      expect(job).toContain("--reporter=line,json");
      expect(job).toContain("node scripts/reportBrowserTiming.ts");
      expect(job).toContain("needs.repository-admission.outputs.browser_required == 'true'");
    }
  });

  it("reuses one archive authority through static and browser consumers", async () => {
    const workflow = await workflowSource();
    const linux = jobBlock(workflow, "linux-verification");
    const integration = jobBlock(workflow, "browser-integration");
    expect(linux).toContain("name: prepared-package-authority");
    expect(linux).toContain("packages/core/dist");
    expect(linux).toContain("packages/vue/dist");
    expect(linux).toContain(".artifacts/packages");
    expect(linux).toContain("include-hidden-files: true");
    expect(integration).toContain("needs: [repository-admission, linux-verification]");
    expect(integration).toContain(
      "artifact-ids: ${{ needs.linux-verification.outputs.package_artifact }}",
    );
    expect(integration).not.toContain("run: pnpm build:packages");
    expect(integration).not.toContain("run: pnpm pack:packages");
    expect(integration).toContain("pnpm build:preview:prepared");
    expect(integration).toContain("pnpm build:fixtures:prepared");
    expect(integration).toContain("pnpm verify:packages:browser:prepared");
    expect(integration).toContain("package_integration_required == 'true'");
    expect(integration).toContain("playwright.preview.config.ts");
    expect(integration).toContain("playwright.fixtures.config.ts");
  });

  it("publishes one fail-closed browser gate and source evidence only after the complete matrix", async () => {
    const certification = jobBlock(await workflowSource(), "browser-certification");
    expect(certification).toContain("name: Browser certification");
    expect(certification).toContain("if: ${{ always() }}");
    expect(certification).toContain("timeout-minutes: 2");
    const dependencies = certification.slice(
      certification.indexOf("    needs:"),
      certification.indexOf("    runs-on:"),
    );
    for (const job of [
      "repository-admission",
      "linux-verification",
      "windows-portability",
      "chromium",
      "cross-browser",
      "browser-integration",
    ])
      expect(dependencies).toContain(job);
    for (const result of [
      "ADMISSION",
      "LINUX",
      "WINDOWS",
      "CHROMIUM",
      "CROSS_BROWSER",
      "INTEGRATION",
    ])
      expect(certification).toContain(result + "_RESULT:");
    expect(certification).toContain("run: node scripts/certifyBrowser.ts");
    expect(certification).toContain("name: verified-source-packages");
    expect(certification).toContain(
      "success() && needs.repository-admission.outputs.browser_required == 'true' && needs.repository-admission.outputs.package_integration_required == 'true'",
    );
  });
});

describe("authoritative Playwright CI policy", () => {
  it("fails on flakes and captures diagnostics only on the first retry", async () => {
    const workflow = await workflowSource();
    for (const file of [
      "playwright.config.ts",
      "playwright.preview.config.ts",
      "playwright.fixtures.config.ts",
    ]) {
      const config = await readFile(resolve(repositoryRoot, file), "utf8");
      expect(config).toContain("forbidOnly: Boolean(process.env.CI)");
      expect(config).toContain("retries: process.env.CI ? 1 : 0");
      expect(config).toContain("failOnFlakyTests: Boolean(process.env.CI)");
      expect(config).toContain('screenshot: "only-on-failure"');
      expect(config).toContain('trace: "on-first-retry"');
      expect(config).toContain('video: "off"');
    }
    const actionReferences = [...workflow.matchAll(/^\s+- uses: (\S+)/gm)].map((match) => match[1]);

    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /@[0-9a-f]{40}$/.test(reference!))).toBe(true);
  });
});
