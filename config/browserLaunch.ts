import type { LaunchOptions } from "@playwright/test";

// Windows WebKit's software path flattens shared perspective and can crash native media transitions.
// Keep real compositing enabled for both source tests and packed consumers, still headless.
export const webkitLaunchOptions: LaunchOptions =
  process.platform === "win32" ? { ignoreDefaultArgs: ["--disable-accelerated-compositing"] } : {};
