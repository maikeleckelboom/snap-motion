export default defineNuxtConfig({
  css: ["@snap-motion/vue/style.css"],
  devtools: { enabled: false },
  vite: { define: { __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: true } },
});
