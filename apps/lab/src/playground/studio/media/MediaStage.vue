<script setup lang="ts">
import { computed, ref } from "vue";

import type { CandidateBehavior } from "../candidates";
import type { MediaOpenRequest, MediaSurfaceHandle } from "./media-surface";
import MediaCarousel from "./MediaCarousel.vue";
import MediaDeck from "./MediaDeck.vue";
import type { SharedMediaItem } from "./shared-media";
import { conversation, homeMediaId } from "./shared-media-data";

/**
 * One candidate behaviour, running on the real surface it describes, over the photos shared in a
 * conversation: a small messaging screen with a header, the photos, and what a person sees about the
 * one in view (who sent it, when, with what message) and the controls they would use.
 *
 * Every stage is given the same photos, the same frame and the same starting photo, and is driven
 * through the same `next` and `previous`, so two stages differ only in the behaviour they run. The
 * surface is uncontrolled apart from the start: a visitor can still drag, flick and use the keyboard,
 * because what is being judged is how it behaves under a hand.
 */
const props = defineProps<{
  behavior: CandidateBehavior;
  items: readonly SharedMediaItem[];
  label: string;
  reducedMotionOverride: boolean | undefined;
  /** Names the stage for tests and for the caption's relationship to its surface. */
  role: "reference" | "candidate" | "detail";
  /**
   * The photo this stage mounts on. A comparison passes the photo the other stage is on, so a stage
   * mounted by a role change begins level with the one that stayed; alone, it is the middle.
   */
  startId?: string;
}>();

const emit = defineEmits<{
  /** The visitor took hold of the stage with a pointer, a wheel, a navigation key or a control. */
  manual: [];
  /** The visitor asked to open a photo. */
  open: [request: MediaOpenRequest & { readonly role: "reference" | "candidate" | "detail" }];
}>();

const surface = ref<MediaSurfaceHandle>();
const homeId = homeMediaId(props.items);
const screenId = ref<string>(props.startId ?? homeId);

const visualItem = computed(
  () =>
    props.items.find(({ id }) => id === surface.value?.visualId) ??
    props.items.find(({ id }) => id === screenId.value),
);
const position = computed(() => surface.value?.activeId);
const moving = computed(() => {
  const handle = surface.value;
  return handle !== undefined && handle.visualId !== handle.settledId;
});
const phase = computed(() => surface.value?.phase ?? "idle");
const positionText = computed(() => {
  const index = props.items.findIndex(({ id }) => id === visualItem.value?.id);
  return `${index + 1} of ${props.items.length}`;
});

const NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function onKeyDown(event: KeyboardEvent) {
  if (NAVIGATION_KEYS.has(event.key)) emit("manual");
}

/**
 * The photo the surface last announced as settled. A surface publishes its rest in two steps: its
 * state says it has stopped, and a moment later it confirms the host agrees with where it stopped. A
 * replay still starts only on the confirmed rest, because that is the surface's own statement that it
 * is at rest on the photo, not merely that its state momentarily says so.
 */
const confirmedId = ref<string>(screenId.value);

function onSettled(id: string) {
  confirmedId.value = id;
}

/**
 * Whether the surface is at rest on `id` and has said so. Being on the photo is not enough: a spring
 * that has only just been sent elsewhere still shows the old one, and one that is returning shows the
 * right one while it is still travelling, so the surface's own phase and its settled announcement
 * have to agree as well.
 */
function restsOn(id: string): boolean {
  const handle = surface.value;
  return (
    handle !== undefined &&
    handle.activeId === id &&
    handle.visualId === id &&
    handle.settledId === id &&
    handle.phase === "idle" &&
    confirmedId.value === id
  );
}

/** The control that asked, when it was a button beside the surface: focus goes back to it. */
let openedFrom: HTMLElement | undefined;

function onOpen(request: MediaOpenRequest) {
  emit("manual");
  emit("open", { ...request, opener: openedFrom ?? request.opener, role: props.role });
}

function openFromButton(event: Event) {
  openedFrom = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
  surface.value?.openSelected();
  openedFrom = undefined;
}

defineExpose({
  next: () => surface.value?.next(),
  previous: () => surface.value?.previous(),
  /** Moves to a photo the way any request does: with the surface's own spring. */
  goTo: (id: string) => {
    screenId.value = id;
    surface.value?.goTo(id);
  },
  reset: () => {
    screenId.value = homeId;
    surface.value?.goTo(homeId);
  },
  restsOn,
  position,
  root: computed(() => surface.value?.root),
  moving,
});
</script>

<template>
  <div
    class="stage-phone"
    :data-candidate="behavior.id"
    :data-surface="behavior.surface"
    :data-testid="`studio-preview-${role}`"
    @keydown.capture="onKeyDown"
    @pointerdown.capture="emit('manual')"
    @wheel.capture.passive="emit('manual')"
  >
    <div class="phone-head">
      <span aria-hidden="true" class="phone-avatar">{{ conversation.initials }}</span>
      <p class="phone-title">
        <strong>{{ conversation.name }}</strong>
        <span>Shared media · {{ items.length }} photos</span>
      </p>
      <div aria-label="Browse photos" class="phone-nav" role="group">
        <button
          aria-label="Previous photo"
          class="phone-step"
          :aria-disabled="surface?.canPrevious ? undefined : 'true'"
          :data-testid="`studio-${role}-previous`"
          type="button"
          @click="surface?.canPrevious && surface?.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next photo"
          class="phone-step"
          :aria-disabled="surface?.canNext ? undefined : 'true'"
          :data-testid="`studio-${role}-next`"
          type="button"
          @click="surface?.canNext && surface?.next()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </div>

    <div class="phone-surface" :data-testid="`studio-${role}-stage`">
      <MediaCarousel
        v-if="behavior.surface === 'carousel'"
        ref="surface"
        :behavior="behavior"
        :data-testid="`studio-${role}-surface`"
        :items="items"
        :label="label"
        :reduced-motion-override="reducedMotionOverride"
        :start-id="screenId"
        @open="onOpen"
        @settled="onSettled"
      />
      <MediaDeck
        v-else
        ref="surface"
        :behavior="behavior"
        :data-testid="`studio-${role}-surface`"
        :items="items"
        :label="label"
        :reduced-motion-override="reducedMotionOverride"
        :start-id="screenId"
        @open="onOpen"
        @settled="onSettled"
      />
    </div>

    <div class="phone-caption" :data-moving="moving ? 'true' : 'false'" :data-phase="phase">
      <div class="caption-text">
        <p class="caption-line">
          <span class="caption-title" :data-testid="`studio-${role}-screen`">{{
            visualItem?.title
          }}</span>
          <span class="caption-position tabular">{{ positionText }}</span>
        </p>
        <p class="caption-meta">
          <span class="caption-from"
            >{{ visualItem?.sender }} · {{ visualItem?.sentAt }} · “{{ visualItem?.message }}”</span
          >
          <span class="caption-state" :data-testid="`studio-${role}-state`">{{
            moving ? "Moving" : "At rest"
          }}</span>
        </p>
      </div>
      <button
        class="phone-open"
        :data-testid="`studio-${role}-open`"
        type="button"
        @click="openFromButton"
      >
        Open photo
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage-phone {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.45rem;
  min-inline-size: 0;
  padding: 0.6rem;
  border: 1px solid var(--pg-line);
  border-radius: 1.1rem;
  background: var(--pg-white);
}

.phone-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.phone-avatar {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 2.1rem;
  block-size: 2.1rem;
  border-radius: 50%;
  background: var(--pg-ink);
  color: var(--pg-white);
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.phone-title {
  display: grid;
  min-inline-size: 0;
  line-height: 1.25;
}

.phone-title strong {
  font-size: 0.92rem;
}

.phone-title span {
  color: var(--pg-muted);
  font-size: 0.75rem;
}

/* A fixed height whichever surface is inside, so two stages stay level whatever they run. */
.phone-surface {
  display: grid;
  align-content: center;
  min-inline-size: 0;
  block-size: 17rem;
  border-radius: 0.6rem;
  background: var(--stage);
}

.phone-caption {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
}

.caption-text {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.1rem;
  min-inline-size: 0;
}

.caption-line,
.caption-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.caption-title {
  min-inline-size: 0;
  overflow: hidden;
  font-size: 0.92rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption-position,
.caption-meta {
  color: var(--pg-muted);
  font-size: 0.75rem;
}

.caption-state {
  flex: none;
  white-space: nowrap;
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.phone-caption[data-moving="true"] .caption-state {
  color: var(--pg-accent);
}

.caption-position {
  flex: none;
  white-space: nowrap;
}

.caption-from {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-nav {
  display: flex;
  margin-inline-start: auto;
}

.phone-step {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
}

.phone-step[aria-disabled="true"] {
  opacity: 0.4;
  cursor: default;
}

.phone-open {
  min-block-size: 2.75rem;
  padding: 0.3rem 0.9rem;
  font-size: 0.88rem;
  font-weight: 600;
}
</style>
