import { defineConfig, devices } from "@playwright/test";

import { chromiumScope, interoperabilitySpecs } from "./config/browserOwnership";

const mediaPreviewSpec = "media-preview.spec.ts";
const stackedDeckSpec = "stacked-deck.spec.ts";
const stackedDeckDirectSpec = "stacked-deck-direct.spec.ts";
const stackedDeckPileSpec = "stacked-deck-pile.spec.ts";
const stackedDeckWebKitSmoke =
  /real pointer movement maps|high-contrast exchange changes depth|successive rendered frames preserve the physical exchange shells|interior and semantic-wrap exchanges|pointer, wheel, and keyboard cross former ordinal edges|repeated revolutions without drift|two-item deck preserves|one held gesture cannot discard|a re-grab during settlement rebases|an accepted arrow from the inspection control|cancel, lost capture, cyclic former edges|inspection, visual semantics, and accessibility/;
const testPort = process.env.SNAP_MOTION_TEST_PORT ?? "4173";
const testUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: mediaPreviewSpec,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 2,
  reporter: process.env.CI ? [["line"], ["blob"]] : "list",
  use: {
    baseURL: testUrl,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      ...chromiumScope(process.env.SNAP_MOTION_BROWSER_GROUP),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testMatch: interoperabilitySpecs,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: interoperabilitySpecs,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-stacked-deck",
      grep: stackedDeckWebKitSmoke,
      testMatch: stackedDeckSpec,
      workers: 2,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-stacked-deck-direct",
      testMatch: stackedDeckDirectSpec,
      workers: 2,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-stacked-deck-pile",
      testMatch: stackedDeckPileSpec,
      workers: 2,
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
