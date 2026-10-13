<script setup lang="ts">
import { defineAsyncComponent, nextTick, provide, ref, watch } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studioRetryKey } from "./studio-activation";
import StudioLoadError from "./StudioLoadError.vue";
import StudioLoading from "./StudioLoading.vue";

/**
 * The activation boundary of section 06.
 *
 * The workspace runs live surfaces side by side. The page above already mounts five, so this section
 * renders a light introduction and loads the workspace only when the visitor opens it. Once opened
 * it stays mounted: scrolling away or changing view never discards the shortlist, the comparison or
 * the decision.
 */
defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();

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
      :reduced-motion-override="reducedMotionOverride"
      :settings="settings"
    />

    <div v-else class="intro" data-testid="studio-intro">
      <div class="intro-copy">
        <h3 class="intro-title">Motion Studio</h3>
        <p class="intro-lede">
          People browse the photos shared in a conversation. How should that feel? Shortlist
          candidates, run two of them side by side on the same photos, tune the one you are testing,
          read what differs and record your choice.
        </p>
        <ol class="intro-journey" aria-label="What you can do">
          <li>Shortlist</li>
          <li>Pin A</li>
          <li>Tune B</li>
          <li>Try both</li>
          <li>Read the differences</li>
          <li>Decide</li>
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
        <g
          font-family="ui-monospace, Consolas, monospace"
          font-size="10"
          letter-spacing="1.4"
          fill="#5f5c52"
        >
          <text x="28" y="40">A · REFERENCE</text>
          <text x="340" y="40">B · CANDIDATE</text>
          <text x="28" y="300">WHAT DIFFERS</text>
        </g>

        <!-- Two stages browsing the same photos: an item carousel on the left, a deck on the right. -->
        <g>
          <rect x="28" y="54" width="272" height="190" rx="10" fill="#f4f2ec" />
          <rect x="40" y="94" width="38" height="110" rx="6" fill="#cfd6dc" />
          <rect x="86" y="86" width="64" height="126" rx="7" fill="#15140f" />
          <rect x="158" y="94" width="82" height="110" rx="6" fill="#cfd6dc" />
          <rect x="248" y="94" width="40" height="110" rx="6" fill="#cfd6dc" />
          <rect x="40" y="222" width="92" height="6" rx="3" fill="#bdb8a8" />

          <rect x="340" y="54" width="272" height="190" rx="10" fill="#f4f2ec" />
          <rect
            x="384"
            y="96"
            width="150"
            height="100"
            rx="7"
            fill="#ead2bf"
            transform="rotate(-6 459 146)"
          />
          <rect
            x="394"
            y="92"
            width="150"
            height="100"
            rx="7"
            fill="#cfd6dc"
            transform="rotate(4 469 142)"
          />
          <rect x="402" y="86" width="150" height="100" rx="7" fill="#15140f" />
          <rect x="352" y="222" width="92" height="6" rx="3" fill="#bdb8a8" />
        </g>

        <!-- The two step responses on one axis, and a row of differences. -->
        <g fill="none" stroke-linecap="round" stroke-width="3">
          <path
            d="M28 380 C60 380 70 310 110 312 S160 338 200 336 S240 328 290 328"
            stroke="#15140f"
          />
          <path
            d="M28 380 C60 380 80 296 120 300 S170 346 210 340 S250 326 290 328"
            stroke="#b84924"
            stroke-dasharray="8 5"
          />
        </g>
        <g fill="#bdb8a8">
          <rect x="340" y="316" width="272" height="8" rx="4" />
          <rect x="340" y="340" width="272" height="8" rx="4" />
          <rect x="340" y="364" width="272" height="8" rx="4" />
        </g>
        <rect x="340" y="338" width="6" height="12" fill="#b84924" />
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
