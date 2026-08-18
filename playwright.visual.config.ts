import { defineConfig, devices } from "@playwright/test";

const visualPort = process.env.SNAP_MOTION_VISUAL_PORT ?? "4174";
const visualUrl = `http://127.0.0.1:${visualPort}`;
const visualViewport = { height: 1_000, width: 1_440 };

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
    contextOptions: { reducedMotion: "no-preference" },
    screenshot: "off",
    trace: "off",
    video: "off",
    viewport: visualViewport,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
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
