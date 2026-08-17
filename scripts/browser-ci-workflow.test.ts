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

  it("shards only Chromium and runs every interoperability project together", async () => {
    const workflow = await workflowSource();
    const chromium = jobBlock(workflow, "chromium");
    const crossBrowser = jobBlock(workflow, "cross-browser");

    expect(chromium).toContain("shard: [1, 2]");
    expect(chromium).toContain("playwright install --with-deps chromium");
    expect(chromium).toContain("--project=chromium");
    expect(chromium).toContain("--shard=${{ matrix.shard }}/2");
    expect(chromium).toContain("--workers=1");
    expect(crossBrowser).toContain("playwright install --with-deps firefox webkit");
    for (const project of ["firefox", "webkit", "webkit-stacked-deck"]) {
      expect(crossBrowser).toContain(`--project=${project}`);
    }
    expect(crossBrowser).toContain("--workers=1");
    expect(crossBrowser).not.toContain("--shard=");
    for (const conditionalJob of [chromium, crossBrowser]) {
      expect(conditionalJob).toContain(
        "needs.repository-admission.outputs.browser_required == 'true'",
      );
    }
  });

  it("shares one Chromium installation and package build across integration contracts", async () => {
    const workflow = await workflowSource();
    const integration = jobBlock(workflow, "browser-integration");

    expect(occurrences(integration, "playwright install --with-deps chromium")).toBe(1);
    expect(occurrences(integration, "run: pnpm build:packages")).toBe(1);
    expect(integration).toContain("pnpm build:preview:prepared");
    expect(integration).toContain("pnpm build:fixtures:prepared");
    expect(integration).toContain("pnpm pack:packages:prepared");
    expect(integration).toContain("name: Certify production preview");
    expect(integration).toContain("name: Certify framework fixtures");
    expect(integration).toContain("name: Certify packed Nuxt build and hydration");
    expect(integration).toContain("pnpm verify:packages:browser:prepared");
    expect(workflow).not.toContain("playwright merge-reports");
    expect(workflow).not.toContain("browser-report:");
    expect(workflow).toContain("playwright-chromium-${{ matrix.shard }}-of-2-attempt-");
    expect(workflow).toContain("playwright-cross-browser-attempt-");
    expect(workflow).toContain("playwright-preview-attempt-");
    expect(workflow).toContain("playwright-fixtures-attempt-");
  });

  it("publishes one stable browser certification that fails closed", async () => {
    const workflow = await workflowSource();
    const certification = jobBlock(workflow, "browser-certification");

    expect(certification).toContain("name: Browser certification");
    expect(certification).toContain("if: ${{ always() }}");
    expect(certification).toContain("timeout-minutes: 2");
    expect(certification).toContain("- repository-admission");
    expect(certification).toContain("- chromium");
    expect(certification).toContain("- cross-browser");
    expect(certification).toContain("- browser-integration");
    expect(certification).toContain('ADMISSION_RESULT" != "success"');
    expect(certification).toContain('BROWSER_REQUIRED" = "false"');
    expect(certification).toContain('CHROMIUM_RESULT" = "skipped"');
    expect(certification).toContain('BROWSER_REQUIRED" = "true"');
    expect(certification).toContain('CHROMIUM_RESULT" = "success"');
    expect(certification).toContain('certified" != "true"');
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
