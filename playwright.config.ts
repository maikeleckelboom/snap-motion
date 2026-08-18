import { defineConfig, devices } from "@playwright/test";

const mediaPreviewSpec = "media-preview.spec.ts";
const showcaseSmokeSpec = "showcase-smoke.spec.ts";
const stackedDeckSpec = "stacked-deck.spec.ts";
const stackedDeckWebKitSmoke =
  /real pointer movement maps|one held gesture cannot discard|a re-grab during settlement rebases|cancel, lost capture, edge elasticity|inspection, visual semantics, and accessibility|successive rendered frames exchange material without cutting or switching it|a backing card never switches what it is made of/;
const testPort = process.env.SNAP_MOTION_TEST_PORT ?? "4173";
const testUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: mediaPreviewSpec,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["line"], ["blob"]] : "list",
  use: {
    baseURL: testUrl,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      testMatch: showcaseSmokeSpec,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: showcaseSmokeSpec,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-stacked-deck",
      grep: stackedDeckWebKitSmoke,
      testMatch: stackedDeckSpec,
      workers: process.env.CI ? 1 : 2,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `pnpm --filter @snap-motion/lab dev --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: testUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
