import { defineConfig, devices } from "@playwright/test";

const visualPort = process.env.SNAP_MOTION_CYCLIC_VISUAL_PORT ?? "4176";
const visualUrl = `http://127.0.0.1:${visualPort}`;

export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: "stacked-deck-cyclic.visual.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: ".artifacts/stacked-deck-cyclic-review/.playwright",
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
    viewport: { width: 1_440, height: 1_000 },
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
        viewport: { width: 1_440, height: 1_000 },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @snap-motion/lab dev --host 127.0.0.1 --port ${visualPort} --strictPort`,
    url: visualUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
