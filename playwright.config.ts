import { defineConfig, devices } from "@playwright/test";

const mediaPreviewSpec = "media-preview.spec.ts";
const stackedDeckSpec = "stacked-deck.spec.ts";
const testPort = process.env.SNAP_MOTION_TEST_PORT ?? "4173";
const testUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: mediaPreviewSpec,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: testUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "webkit",
      testIgnore: [mediaPreviewSpec, stackedDeckSpec],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-stacked-deck",
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
