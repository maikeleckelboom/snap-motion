<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ itemId: string }>();
const studies = [
  { name: "Orbit", kind: "Circular path", color: "#e6b091" },
  { name: "Traverse", kind: "Point to point", color: "#e4ded1" },
  { name: "Fold", kind: "Surface study", color: "#cbd3d9" },
  { name: "Relay", kind: "Sequence", color: "#ded4bb" },
  { name: "Drift", kind: "Free movement", color: "#d9ccc8" },
  { name: "Return", kind: "Spring response", color: "#bec9d0" },
  { name: "Arc", kind: "Curved path", color: "#e4ded1" },
  { name: "Spiral", kind: "Circular path", color: "#e6b091" },
  { name: "Step", kind: "Anchor sequence", color: "#cbd3d9" },
] as const;
const number = computed(() => Number(props.itemId.replace("item-", "")) - 1);
const study = computed(() => studies[number.value % studies.length]!);
</script>

<template>
  <div class="study-tile" :style="{ '--study-color': study.color }">
    <span class="study-reference">
      {{ String(number + 1).padStart(2, "0") }}<span class="study-reference-label"> / STUDY</span>
    </span>
    <svg aria-hidden="true" viewBox="0 0 200 100" class="study-drawing">
      <template v-if="number % 3 === 0">
        <circle cx="98" cy="48" r="36" fill="currentColor" />
        <circle cx="120" cy="35" r="27" fill="var(--study-color)" />
        <circle cx="65" cy="78" r="7" fill="#b84924" />
      </template>
      <template v-else-if="number % 3 === 1">
        <path
          d="M33 76 72 22 123 76 163 22"
          fill="none"
          stroke="currentColor"
          stroke-width="9"
          stroke-linejoin="round"
        />
        <circle cx="163" cy="22" r="8" fill="#b84924" />
      </template>
      <template v-else>
        <rect x="48" y="12" width="72" height="72" rx="4" fill="currentColor" />
        <rect x="88" y="32" width="70" height="53" rx="4" fill="var(--study-color)" />
        <path d="m89 32 69 53" stroke="#b84924" stroke-width="3" />
      </template>
    </svg>
    <strong :title="study.name">{{ study.name }}</strong>
    <span class="study-kind">{{ study.kind }}</span>
  </div>
</template>

<style scoped>
.study-tile {
  display: grid;
  grid-template-rows: auto minmax(2rem, 1fr) auto auto;
  gap: 0.2rem;
  block-size: 100%;
  min-inline-size: 0;
  padding: 0.75rem;
  border-radius: 0.6rem;
  background: var(--study-color);
  color: #232527;
}
.study-reference {
  font-family: var(--pg-font-mono);
  font-size: 0.65rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.study-drawing {
  inline-size: 100%;
  block-size: 5rem;
  align-self: center;
}
.study-tile strong {
  font-size: clamp(0.9rem, 1.5vw, 1.25rem);
  font-weight: 650;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.study-kind {
  font-size: 0.72rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
@media (max-width: 40rem) {
  .study-tile {
    padding: 0.6rem;
  }
  .study-drawing {
    block-size: 3rem;
  }
  .study-kind {
    font-size: 0.65rem;
  }
}
/* Below 96px, the full name/type stack competes with the drawing. The Grid cell owns this
   context; the same tile in the Sheet preview keeps its complete, unqueried presentation. */
@container motion-study (inline-size < 6rem) {
  .study-tile {
    grid-template-rows: auto minmax(2rem, 1fr) auto;
    padding: 0.35rem;
  }
  .study-reference-label,
  .study-kind {
    display: none;
  }
  .study-tile strong {
    overflow: hidden;
    font-size: 0.72rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .study-drawing {
    block-size: 2.5rem;
  }
}
</style>
