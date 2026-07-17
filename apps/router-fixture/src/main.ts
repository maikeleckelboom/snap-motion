import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/work/factif" },
    { path: "/work/:slug", component: App },
    { path: "/work/:slug/media/:mediaId", component: App },
  ],
});

createApp(App).use(router).mount("#app");
