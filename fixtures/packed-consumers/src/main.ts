import "@snap-motion/vue/style.css";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: App }],
});
createApp(App).use(router).mount("#app");
