import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./fixture-e2e",
  fullyParallel: false,
  reporter: process.env.CI ? "line" : "list",
  use: { ...devices["Desktop Chrome"] },
  webServer: [
    {
      command:
        "pnpm --filter @snap-motion/router-fixture exec vite preview --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174/work/factif",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node apps/nuxt-fixture/.output/server/index.mjs",
      env: { NITRO_HOST: "127.0.0.1", NITRO_PORT: "4175" },
      url: "http://127.0.0.1:4175/work/factif",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
