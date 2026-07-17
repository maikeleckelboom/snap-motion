<script setup lang="ts">
const route = useRoute();
const titles: Record<string, string> = {
  overview: "Project overview",
  system: "System detail",
  outcome: "Measured outcome",
};
const title = computed(() => titles[String(route.params.mediaId)] ?? "Media item not found");
</script>

<template>
  <main>
    <NuxtLink :to="`/work/${route.params.slug}`">Back to case study</NuxtLink>
    <article>
      <h1>{{ title }}</h1>
      <p>This full-page route remains meaningful without JavaScript.</p>
    </article>
  </main>
</template>
