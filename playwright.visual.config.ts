import { defineConfig, devices } from "@playwright/test";

import { readVisualScenarioFromEnvironment } from "./scripts/stackedDeckVisualScenario.ts";

const visualPort = process.env.SNAP_MOTION_VISUAL_PORT ?? "4174";
const visualUrl = `http://127.0.0.1:${visualPort}`;
const scenario = readVisualScenarioFromEnvironment();
const visualViewport = scenario.config.viewport;

export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: "stacked-deck.visual.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: ".artifacts/stacked-deck-visual-review/.playwright",
  use: {
    baseURL: visualUrl,
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "no-preference",
    screenshot: "off",
    timezoneId: "UTC",
    trace: "off",
    video: "off",
    viewport: visualViewport,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        deviceScaleFactor: 1,
        locale: "en-US",
        reducedMotion: "no-preference",
        timezoneId: "UTC",
        viewport: visualViewport,
      },
    },
  ],
  webServer: {
    command: `corepack pnpm --filter @snap-motion/lab dev --host 127.0.0.1 --port ${visualPort} --strictPort`,
    url: visualUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
