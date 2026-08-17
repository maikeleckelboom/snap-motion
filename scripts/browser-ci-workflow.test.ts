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

function matrixEntries(block: string) {
  return [
    ...block.matchAll(
      /- project: (.+)\n\s+browser: (.+)\n\s+shard: (\d+)\n\s+total: (\d+)\n\s+display: (.+)/g,
    ),
  ].map((match) => ({
    project: match[1],
    browser: match[2],
    shard: Number(match[3]),
    total: Number(match[4]),
    display: match[5],
  }));
}

describe("Verify browser CI topology", () => {
  it("replaces the monolithic browser job with eight explicit one-worker shards", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const shard = jobBlock(workflow, "browser-shard");
    const entries = matrixEntries(shard);

    expect(workflow).not.toContain("name: Browser regression");
    expect(entries).toEqual([
      { project: "chromium", browser: "chromium", shard: 1, total: 2, display: "Chromium 1/2" },
      { project: "chromium", browser: "chromium", shard: 2, total: 2, display: "Chromium 2/2" },
      { project: "firefox", browser: "firefox", shard: 1, total: 2, display: "Firefox 1/2" },
      { project: "firefox", browser: "firefox", shard: 2, total: 2, display: "Firefox 2/2" },
      { project: "webkit", browser: "webkit", shard: 1, total: 2, display: "WebKit 1/2" },
      { project: "webkit", browser: "webkit", shard: 2, total: 2, display: "WebKit 2/2" },
      {
        project: "webkit-stacked-deck",
        browser: "webkit",
        shard: 1,
        total: 2,
        display: "WebKit Stacked Deck 1/2",
      },
      {
        project: "webkit-stacked-deck",
        browser: "webkit",
        shard: 2,
        total: 2,
        display: "WebKit Stacked Deck 2/2",
      },
    ]);
    expect(shard).toContain("fail-fast: false");
    expect(shard).toContain("max-parallel: 8");
    expect(shard).toContain("timeout-minutes: 10");
    expect(shard).toContain("playwright install --with-deps ${{ matrix.browser }}");
    expect(shard).toContain("--project=${{ matrix.project }}");
    expect(shard).toContain("--shard=${{ matrix.shard }}/${{ matrix.total }}");
    expect(shard).toContain("--workers=1");
    expect(shard).not.toContain("pnpm build");
    expect(shard).not.toContain("pnpm test:e2e");
  });

  it("uses a fail-closed scope job without suppressing the workflow", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const scope = jobBlock(workflow, "browser-scope");
    const shard = jobBlock(workflow, "browser-shard");
    const preview = jobBlock(workflow, "browser-preview");
    const fixtures = jobBlock(workflow, "browser-fixtures");

    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m);
    expect(workflow).not.toContain("changed-files");
    expect(scope).toContain("timeout-minutes: 5");
    expect(scope).toContain("fetch-depth: 0");
    expect(scope).toContain("node scripts/classify-browser-change.ts");
    expect(scope).toContain("browser_required: ${{ steps.classify.outputs.browser_required }}");
    for (const conditionalJob of [shard, preview, fixtures]) {
      expect(conditionalJob).toContain("needs.browser-scope.outputs.browser_required == 'true'");
    }
  });

  it("runs preview and fixtures in parallel with only their targeted builds", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const manifest = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const preview = jobBlock(workflow, "browser-preview");
    const fixtures = jobBlock(workflow, "browser-fixtures");

    expect(preview).toContain("timeout-minutes: 10");
    expect(preview).toContain("pnpm exec playwright install --with-deps chromium");
    expect(preview).toContain("pnpm build:preview");
    expect(preview).toContain("playwright.preview.config.ts --workers=1");
    expect(preview).not.toContain("needs: browser-shard");
    expect(fixtures).toContain("timeout-minutes: 10");
    expect(fixtures).toContain("pnpm exec playwright install --with-deps chromium");
    expect(fixtures).toContain("pnpm build:fixtures");
    expect(fixtures).toContain("playwright.fixtures.config.ts --workers=1");
    expect(fixtures).not.toContain("pnpm build\n");
    expect(fixtures).not.toContain("needs: browser-shard");
    expect(manifest.scripts["build:preview"]).toBe(
      "pnpm build:packages && pnpm --filter @snap-motion/lab build:preview",
    );
    expect(manifest.scripts["build:fixtures"]).toBe(
      "pnpm build:packages && pnpm --filter @snap-motion/router-fixture build && pnpm --filter @snap-motion/nuxt-fixture build",
    );
  });

  it("retains unique blob evidence and merges reports even after shard failure", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const shard = jobBlock(workflow, "browser-shard");
    const report = jobBlock(workflow, "browser-report");

    expect(shard).toContain(
      "playwright-blob-${{ matrix.project }}-${{ matrix.shard }}-of-${{ matrix.total }}-attempt-${{ github.run_attempt }}",
    );
    expect(shard).toContain("PLAYWRIGHT_BLOB_OUTPUT_NAME:");
    expect(shard).toContain("if: ${{ !cancelled() }}");
    expect(shard).toContain("retention-days: 1");
    expect(report).toContain("if: ${{ always()");
    expect(report).toContain("needs: [browser-scope, browser-shard]");
    expect(report).toContain("timeout-minutes: 5");
    expect(report).toContain("pattern: playwright-blob-*-attempt-${{ github.run_attempt }}");
    expect(report).toContain("playwright merge-reports --reporter html");
    expect(report).toContain("retention-days: 7");
    expect(report).not.toContain("playwright install");
  });

  it("publishes one stable Browser certification job that fails closed", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const certification = jobBlock(workflow, "browser-certification");

    expect(certification).toContain("name: Browser certification");
    expect(certification).toContain("if: ${{ always() }}");
    expect(certification).toContain("timeout-minutes: 5");
    expect(certification).toContain("- browser-scope");
    expect(certification).toContain("- browser-shard");
    expect(certification).toContain("- browser-preview");
    expect(certification).toContain("- browser-fixtures");
    expect(certification).toContain("- browser-report");
    expect(certification).toContain('SCOPE_RESULT" != "success"');
    expect(certification).toContain('BROWSER_REQUIRED" = "false"');
    expect(certification).toContain('SHARD_RESULT" = "skipped"');
    expect(certification).toContain('BROWSER_REQUIRED" = "true"');
    expect(certification).toContain('SHARD_RESULT" = "success"');
    expect(certification).toContain('certified" != "true"');
  });
});

describe("authoritative Playwright CI policy", () => {
  it("fails on flakes and captures diagnostics only on the first retry", async () => {
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
  });

  it("keeps every action pinned and release history full-depth", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/verify.yml"),
      "utf8",
    );
    const actionReferences = [...workflow.matchAll(/^\s+- uses: (\S+)/gm)].map((match) => match[1]);
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /@[0-9a-f]{40}$/.test(reference!))).toBe(true);

    const releaseHistory = jobBlock(workflow, "release-candidate-history");
    expect(releaseHistory).toContain("fetch-depth: 0");
    expect(releaseHistory).toContain("node scripts/check-release-candidate-history.ts");
  });
});
