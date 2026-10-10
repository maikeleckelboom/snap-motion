<script setup lang="ts">
import type { StackedDeckExchange } from "@snap-motion/core";
import { defineAsyncComponent, nextTick, provide, ref, watch } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studioRetryKey } from "./studio-activation";
import StudioLoadError from "./StudioLoadError.vue";
import StudioLoading from "./StudioLoading.vue";

/**
 * The activation boundary of section 06.
 *
 * The workspace mounts a Paged Grid, a Coverflow, a Stacked Deck, a Gallery and a Sheet. The page
 * above already mounts five surfaces, so this section renders a light introduction and loads the
 * workspace only when the visitor opens it. Once opened it stays mounted: scrolling away or
 * changing view never discards the selection, the comparison or the notes.
 */
defineProps<{
  exchange: StackedDeckExchange;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();
const emit = defineEmits<{ exchangeChange: [exchange: StackedDeckExchange] }>();

const loadWorkspace = () => import("./StudioWorkspace.vue");
const StudioWorkspace = defineAsyncComponent({
  loader: loadWorkspace,
  loadingComponent: StudioLoading,
  // One automatic retry covers a dropped connection; after that the visitor decides.
  onError(_error, retry, fail, attempts) {
    if (attempts <= 1) retry();
    else fail();
  },
  errorComponent: StudioLoadError,
  delay: 0,
});

const activated = ref(false);
const workspace = ref<{ focus(): void }>();
let prefetched = false;

/** Warm the chunk on intent. It costs nothing until the visitor reaches for the button. */
function prefetch() {
  if (prefetched) return;
  prefetched = true;
  void loadWorkspace().catch(() => {
    prefetched = false;
  });
}

function activate() {
  activated.value = true;
}

async function retryActivation() {
  activated.value = false;
  await nextTick();
  activated.value = true;
}
provide(studioRetryKey, () => void retryActivation());

// The activation button leaves the DOM when the workspace takes its place, so focus is handed to the
// workspace itself instead of being dropped on the document.
// The ref first names the loading state; only the real workspace exposes `focus`.
const stop = watch(workspace, (instance) => {
  if (typeof instance?.focus !== "function") return;
  instance.focus();
  stop();
});

defineExpose({ activate });
</script>

<template>
  <div
    class="studio-stage"
    :data-activated="activated ? 'true' : 'false'"
    data-testid="studio-stage"
  >
    <StudioWorkspace
      v-if="activated"
      ref="workspace"
      :exchange="exchange"
      :reduced-motion-override="reducedMotionOverride"
      :settings="settings"
      @exchange-change="emit('exchangeChange', $event)"
    />

    <div v-else class="intro" data-testid="studio-intro">
      <div class="intro-copy">
        <h3 class="intro-title">Motion Studio</h3>
        <p class="intro-lede">
          A small product built from the surfaces above. Browse a collection, compare studies on a
          deck, inspect their plates and keep a note, all on one selection and one set of motion
          settings.
        </p>
        <ol class="intro-journey" aria-label="What you can do">
          <li>Browse</li>
          <li>Select</li>
          <li>Explore</li>
          <li>Compare</li>
          <li>Inspect</li>
          <li>Refine</li>
        </ol>
        <div class="intro-actions">
          <button
            class="intro-button"
            data-testid="studio-activate"
            type="button"
            @click="activate"
            @focus="prefetch"
            @pointerenter="prefetch"
            @touchstart.passive="prefetch"
          >
            Open Motion Studio
          </button>
          <p class="intro-note">It loads when you open it, so the page above stays light.</p>
        </div>
      </div>

      <svg
        aria-hidden="true"
        class="intro-preview"
        focusable="false"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 640 420"
      >
        <rect width="640" height="420" fill="#e9e5d9" rx="14" />
        <path d="M262 14v392M262 214h364" stroke="#cfcabb" stroke-width="1.5" />
        <g
          font-family="ui-monospace, Consolas, monospace"
          font-size="10"
          letter-spacing="1.4"
          fill="#5f5c52"
        >
          <text x="24" y="38">01 / BROWSE</text>
          <text x="286" y="38">02 / EXPLORE</text>
          <text x="286" y="238">03 / COMPARE</text>
          <text x="24" y="238">ACTIVE STUDY</text>
        </g>

        <!-- Browse: a two-by-two page of tiles, one selected. -->
        <g>
          <rect x="24" y="56" width="104" height="73" rx="8" fill="#e6b091" />
          <circle cx="68" cy="94" r="22" fill="#232527" />
          <circle cx="86" cy="84" r="16" fill="#f4ddd0" />
          <rect x="140" y="56" width="104" height="73" rx="8" fill="#e4ded1" />
          <path
            d="M156 112l22-34 22 34 22-34"
            fill="none"
            stroke="#232527"
            stroke-width="7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect x="24" y="141" width="104" height="73" rx="8" fill="#cbd3d9" />
          <rect x="52" y="157" width="36" height="36" rx="3" fill="#232527" />
          <rect x="70" y="171" width="36" height="30" rx="3" fill="#eef1f3" />
          <rect x="140" y="141" width="104" height="73" rx="8" fill="#ded4bb" />
          <circle cx="166" cy="180" r="14" fill="#232527" />
          <circle cx="196" cy="180" r="10" fill="#232527" />
          <circle cx="220" cy="180" r="6" fill="#b84924" />
          <rect
            x="21"
            y="53"
            width="110"
            height="79"
            rx="10"
            fill="none"
            stroke="#15140f"
            stroke-width="2.5"
          />
        </g>

        <!-- Active study. -->
        <g>
          <rect x="24" y="250" width="86" height="60" rx="6" fill="#cbd3d9" />
          <rect x="52" y="262" width="26" height="26" rx="3" fill="#232527" />
          <rect x="66" y="274" width="26" height="22" rx="3" fill="#eef1f3" />
          <rect x="124" y="252" width="94" height="10" rx="3" fill="#232527" />
          <rect x="124" y="272" width="118" height="6" rx="3" fill="#bdb8a8" />
          <rect x="124" y="286" width="96" height="6" rx="3" fill="#bdb8a8" />
          <rect x="24" y="330" width="122" height="30" rx="7" fill="#15140f" />
          <rect
            x="156"
            y="330"
            width="40"
            height="30"
            rx="7"
            fill="none"
            stroke="#15140f"
            stroke-width="1.5"
          />
          <rect
            x="204"
            y="330"
            width="40"
            height="30"
            rx="7"
            fill="none"
            stroke="#15140f"
            stroke-width="1.5"
          />
        </g>

        <!-- Explore: a rail of cards in perspective around the front card. -->
        <g>
          <path d="M296 92l56-14v108l-56-14z" fill="#d9ccc8" />
          <path d="M608 92l-56-14v108l56-14z" fill="#bec9d0" />
          <path d="M342 84l36-8v96l-36-8z" fill="#e4ded1" />
          <path d="M562 84l-36-8v96l36-8z" fill="#ded4bb" />
          <rect x="396" y="64" width="132" height="92" rx="7" fill="#cbd3d9" />
          <rect x="426" y="80" width="46" height="46" rx="4" fill="#232527" />
          <rect x="452" y="100" width="46" height="38" rx="4" fill="#eef1f3" />
          <path d="M456 102l42 34" stroke="#b84924" stroke-width="3" />
          <circle cx="462" cy="188" r="3" fill="#232527" />
          <circle cx="446" cy="188" r="2.5" fill="#bdb8a8" />
          <circle cx="478" cy="188" r="2.5" fill="#bdb8a8" />
        </g>

        <!-- Compare: a pile, the top card slightly turned. -->
        <g>
          <rect
            x="360"
            y="276"
            width="140"
            height="96"
            rx="7"
            fill="#ded4bb"
            transform="rotate(-5 430 324)"
          />
          <rect
            x="372"
            y="268"
            width="140"
            height="96"
            rx="7"
            fill="#d9ccc8"
            transform="rotate(4 442 316)"
          />
          <rect x="384" y="262" width="140" height="96" rx="7" fill="#e6b091" />
          <circle cx="428" cy="310" r="26" fill="#232527" />
          <circle cx="448" cy="298" r="18" fill="#f4ddd0" />
          <circle cx="408" cy="338" r="5" fill="#b84924" />
          <rect
            x="560"
            y="276"
            width="44"
            height="22"
            rx="11"
            fill="none"
            stroke="#15140f"
            stroke-width="1.5"
          />
          <rect x="560" y="306" width="44" height="22" rx="11" fill="#15140f" />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
/*
 * Nothing is reserved for the workspace: the introduction is the section's own, complete content,
 * so the page is stable as it loads. Opening the workspace grows the section downward, in response
 * to the visitor's own input, and never moves anything above it.
 */
.studio-stage {
  min-inline-size: 0;
  border-block: 1px solid var(--pg-ink);
}

.studio-stage[data-activated="true"] {
  border-block: 0;
}

.intro {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 3.5rem);
  padding-block: clamp(1.5rem, 4vw, 3rem);
}

.intro-copy {
  display: grid;
  gap: 1.1rem;
  align-content: center;
  justify-items: start;
}

.intro-title {
  font-size: clamp(1.5rem, 1.1rem + 1.4vw, 2.1rem);
  font-weight: 650;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.intro-lede {
  max-inline-size: 30rem;
  color: var(--pg-ink-soft);
  font-size: 1rem;
  line-height: 1.55;
}

.intro-journey {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.intro-journey li + li::before {
  content: "→";
  margin-inline-end: 0.75rem;
  color: var(--pg-line-strong);
}

.intro-actions {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
}

.intro-button {
  min-block-size: 3rem;
  padding: 0.5rem 1.4rem;
  border-color: var(--pg-ink);
  border-radius: 0.6rem;
  background: var(--pg-ink);
  color: var(--pg-white);
  font-size: 1rem;
  font-weight: 650;
}

.intro-button:hover {
  background: var(--pg-ink-soft);
}

.intro-note {
  color: var(--pg-muted);
  font-size: 0.82rem;
}

.intro-preview {
  inline-size: 100%;
  max-inline-size: 44rem;
  block-size: auto;
  justify-self: end;
}

@media (max-width: 61.99rem) {
  .intro {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 1.5rem;
  }

  .intro-preview {
    justify-self: start;
    order: -1;
  }
}
</style>
