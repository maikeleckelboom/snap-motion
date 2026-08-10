import { defineConfig, devices } from "@playwright/test";

const mediaPreviewSpec = "media-preview.spec.ts";
const stackedDeckSpec = "stacked-deck.spec.ts";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: mediaPreviewSpec,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
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
    command: "pnpm --filter @snap-motion/lab dev --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
