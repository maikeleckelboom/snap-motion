import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  compatibilityDate: "2026-07-17",
  css: ["@snap-motion/vue/style.css"],
  devtools: { enabled: false },
  ssr: true,
  nitro: {
    publicAssets: [
      {
        dir: fileURLToPath(new URL("../../fixtures/packed-consumers/nuxt/public", import.meta.url)),
      },
    ],
  },
  vite: { define: { __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: true } },
});
