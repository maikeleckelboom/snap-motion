<script setup lang="ts">
defineProps<{ name: string; notifications: boolean; density: string }>();
const emit = defineEmits<{
  (event: "update:name", value: string): void;
  (event: "update:notifications", value: boolean): void;
  (event: "update:density", value: string): void;
}>();
</script>

<template>
  <div class="inspector-content" data-testid="inspector-content">
    <label>
      <span>Workspace name</span>
      <input
        data-testid="inspector-name"
        :value="name"
        @input="emit('update:name', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label>
      <span>Density</span>
      <select
        :value="density"
        @change="emit('update:density', ($event.target as HTMLSelectElement).value)"
      >
        <option value="calm">Calm</option>
        <option value="compact">Compact</option>
      </select>
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        :checked="notifications"
        @change="emit('update:notifications', ($event.target as HTMLInputElement).checked)"
      />
      <span>Completion notifications</span>
    </label>
  </div>
</template>

<style scoped>
.inspector-content {
  display: grid;
  gap: 1rem;
  padding-block: 1rem;
}
.inspector-content label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
}
.inspector-content :is(input, select) {
  min-block-size: 2.75rem;
  padding-inline: 0.7rem;
  border: 1px solid currentColor;
  background: Canvas;
  color: CanvasText;
}
.inspector-content .toggle {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}
.inspector-content .toggle input {
  min-block-size: 1.25rem;
  inline-size: 1.25rem;
}
</style>
