<script setup lang="ts">
import SurfacePreferences from "../components/SurfacePreferences.vue";

const query = useRoute().query;
const preference =
  query.preference === "true" ? true : query.preference === "false" ? false : undefined;
</script>

<template>
  <SurfacePreferences
    :preference="preference"
    :card-width="query.width ? Number(query.width) : undefined"
    :allocation="query.allocation ? Number(query.allocation) : undefined"
  />
</template>
