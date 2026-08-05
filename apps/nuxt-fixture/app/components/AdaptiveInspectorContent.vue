<script setup lang="ts">
defineProps<{ name: string }>();
const emit = defineEmits<{ (event: "update:name", value: string): void }>();
</script>

<template>
  <label data-testid="nuxt-inspector-content">
    <span>Workspace name</span>
    <input
      data-testid="nuxt-inspector-name"
      :value="name"
      @input="emit('update:name', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
