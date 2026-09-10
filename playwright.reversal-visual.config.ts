import { defineConfig, devices } from "@playwright/test";

const visualPort = process.env.SNAP_MOTION_REVERSAL_VISUAL_PORT ?? "4177";
const visualUrl = `http://127.0.0.1:${visualPort}`;
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("Reversal visual review requires the repository pnpm CLI path.");

export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: "stacked-deck-reversal.visual.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: ".artifacts/stacked-deck-reversal-review/.playwright",
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
        video: "off",
        viewport: { width: 1_440, height: 1_000 },
      },
    },
  ],
  webServer: {
    command: `"${process.execPath}" "${pnpmCli}" --filter @snap-motion/lab dev --host 127.0.0.1 --port ${visualPort} --strictPort`,
    url: visualUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
