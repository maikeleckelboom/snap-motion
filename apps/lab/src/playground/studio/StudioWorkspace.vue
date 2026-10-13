<script setup lang="ts">
import type { FocusReturnOptions } from "@snap-motion/vue/dialog";
import { useMediaQuery } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, provide, ref, shallowRef, useId } from "vue";

import SegmentedControl from "@/components/SegmentedControl.vue";
import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { presetLabel } from "../preset-facts";
import { usePlaygroundTuning } from "../tuning-context";
import {
  CUSTOM_ID,
  candidateById,
  candidateDefinitions,
  candidateIds,
  describeShape,
  resolveCandidate,
  type CandidateBehavior,
  type CandidateId,
} from "./candidates";
import type { MediaOpenRequest } from "./media/media-surface";
import { sharedMedia } from "./media/shared-media";
import { studioKey, type StudioCommands } from "./studio-context";
import { createCustomCandidate } from "./studio-custom";
import {
  MAX_SHORTLIST,
  createStudioModel,
  type ShortlistExchange,
  type StudioView,
} from "./studio-model";
import { cancelStudioTransition, runStudioTransition } from "./studio-transition";
import { tuneCandidateB, type TunePatch } from "./studio-tune";
import StudioCandidates from "./StudioCandidates.vue";
import StudioCompare from "./StudioCompare.vue";
import StudioMediaViewer from "./StudioMediaViewer.vue";
import StudioSheet from "./StudioSheet.vue";
import StudioShortlist from "./StudioShortlist.vue";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();

/**
 * Where a first visit starts: two candidates already shortlisted, so Compare has something to show.
 * Both are item carousels at opposite ends of the engine's presets (Tight is A, Loose is B), so the
 * first thing to try is the feel; the Shortlist's Deck holds B alone until another is shortlisted.
 */
const model = createStudioModel<CandidateId>({
  ids: candidateIds,
  initialShortlist: ["carousel-tight", "carousel-loose"],
});
/** The one owner of the Custom candidate. It never reads or writes the Playground's tuning. */
const continuity = { forked: false };
const custom = createCustomCandidate();

const tuning = usePlaygroundTuning();
const titleId = `${useId()}-title`;
const root = ref<HTMLElement>();
const layout = ref<HTMLElement>();
const candidates = ref<InstanceType<typeof StudioCandidates>>();
const shortlist = ref<InstanceType<typeof StudioShortlist>>();
const statusText = ref("");
const sheetOpener = shallowRef<HTMLElement>();
const mediaOpener = shallowRef<HTMLElement>();
/** Which stage and photo the viewer was opened from, so closing can return to that thumbnail. */
let mediaOrigin: { role: "reference" | "candidate" | "detail"; id: string } | undefined;
const wide = useMediaQuery("(min-width: 62rem)");
const systemReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const reducedMotion = computed(() => props.reducedMotionOverride ?? systemReducedMotion.value);

const media = sharedMedia;

// ---------------------------------------------------------------------------------- behaviours

// A reference candidate never changes, so each is resolved once. Only Custom follows the state that
// owns it. Neither reads the Playground's tuning.
const fixed = new Map<CandidateId, CandidateBehavior>(
  candidateDefinitions
    .filter(({ id }) => id !== CUSTOM_ID)
    .map((definition) => [definition.id, resolveCandidate(definition, custom.state.value)]),
);
const customBehavior = computed(() =>
  resolveCandidate(candidateById.get(CUSTOM_ID)!, custom.state.value),
);
function behavior(id: CandidateId): CandidateBehavior {
  return fixed.get(id) ?? customBehavior.value;
}
const nameOf = (id: CandidateId | undefined) => (id === undefined ? "none" : behavior(id).name);

// A change of the one status string is the only thing a screen reader hears from the workspace, so
// repeating a message must still change it.
function announce(message: string) {
  statusText.value = statusText.value === message ? `${message} ` : message;
}

// ---------------------------------------------------------------------------------- summary

const summaryText = computed(() => {
  const count = model.shortlist.value.length;
  return `${count} shortlisted · A ${nameOf(model.referenceId.value)} · B ${nameOf(model.shownCandidateId.value)}`;
});
const decisionText = computed(() =>
  model.decidedId.value === undefined
    ? "No decision yet"
    : `Chosen: ${nameOf(model.decidedId.value)}`,
);
const motionLabel = computed(() => {
  const modified = tuning.modifiedKeys.value.length > 0;
  return `${presetLabel(tuning.preset.value)}${modified ? " · modified" : ""}`;
});

const viewOptions: { label: string; value: StudioView; testid: string }[] = [
  { label: "Candidates", value: "candidates", testid: "studio-view-candidates" },
  { label: "Compare", value: "compare", testid: "studio-view-compare" },
];

// ---------------------------------------------------------------------------------- transitions

interface PresentOptions {
  region?: HTMLElement | undefined;
  shared?: { source: HTMLElement | undefined; destination: () => HTMLElement | undefined };
  afterUpdate?: () => void;
}

type PresentKind = "view" | "detail" | "media";

/**
 * Presents a change of application state with the browser's own View Transition, when it can. The
 * regions it names are chosen here, by the Studio, from its own DOM: nothing reaches into a package
 * surface, and no transition runs over a Deck, Rail or Sheet exchange.
 */
function present(
  kind: PresentKind,
  direction: 1 | -1,
  update: () => void,
  options: PresentOptions = {},
) {
  void runStudioTransition({
    kind,
    direction,
    reducedMotion: reducedMotion.value,
    update,
    ...(options.afterUpdate ? { afterUpdate: options.afterUpdate } : {}),
    ...(kind === "media"
      ? {}
      : {
          region: {
            name: kind === "view" ? "studio-view" : "studio-detail",
            element: options.region,
          },
        }),
    ...(options.shared
      ? { shared: { name: kind === "media" ? "studio-photo" : "studio-glyph", ...options.shared } }
      : {}),
  });
}

onBeforeUnmount(() => cancelStudioTransition(document));

const viewerPhoto = () =>
  root.value?.querySelector<HTMLElement>("[data-testid='studio-media-photo']") ?? undefined;

/**
 * The thumbnail the viewer was opened from, if it can be returned to: on screen, on a surface at rest,
 * and still the selected photo. Anything else closes with no transition.
 */
function restingThumbnail(role: "reference" | "candidate" | "detail", id: string) {
  const stage = root.value?.querySelector<HTMLElement>(`[data-testid='studio-preview-${role}']`);
  const surface = stage?.querySelector<HTMLElement>("[data-phase]");
  if (!stage || surface?.dataset.phase !== "idle") return undefined;
  const image = stage.querySelector<HTMLElement>(
    `[data-media-id="${id}"] img, [data-media-image="${id}"]`,
  );
  if (!image) return undefined;
  const box = image.getBoundingClientRect();
  const visible =
    box.width > 0 &&
    box.height > 0 &&
    box.bottom > 0 &&
    box.top < window.innerHeight &&
    box.right > 0 &&
    box.left < window.innerWidth;
  return visible ? image : undefined;
}

const detailGlyph = () =>
  root.value?.querySelector<HTMLElement>("[data-testid='studio-detail'] [data-shared-glyph]") ??
  undefined;

// ---------------------------------------------------------------------------------- commands

function snapshot() {
  return { a: model.referenceId.value, b: model.candidateId.value };
}

/** What a change did to the two roles, in words. */
function describeRoles(before: { a: CandidateId | undefined; b: CandidateId | undefined }) {
  const a = model.referenceId.value;
  const b = model.candidateId.value;
  const notes: string[] = [];
  if (a !== before.a && a !== undefined) notes.push(`${nameOf(a)} is the reference A`);
  if (b !== before.b && b !== undefined && b !== a) notes.push(`${nameOf(b)} is compared as B`);
  return notes.length > 0 ? `. ${notes.join(". ")}` : "";
}

const commands: StudioCommands = {
  toggleShortlist(id) {
    const before = snapshot();
    const name = nameOf(id);
    const outcome = model.toggleShortlist(id);
    const count = model.shortlist.value.length;
    if (outcome === "added") {
      announce(
        `${name} added to the shortlist, ${count} of ${MAX_SHORTLIST}${describeRoles(before)}`,
      );
    } else if (outcome === "removed") {
      announce(
        `${name} removed from the shortlist, ${count} of ${MAX_SHORTLIST}${describeRoles(before)}`,
      );
    } else if (outcome === "full") {
      announce(`The shortlist holds ${MAX_SHORTLIST}. Remove one to add ${name}`);
    }
  },
  async removeFromShortlist(id) {
    const index = model.shortlist.value.indexOf(id);
    commands.toggleShortlist(id);
    await nextTick();
    shortlist.value?.focusAfterRemoval(index);
  },
  pinReference(id) {
    const before = snapshot();
    const outcome = model.pinReference(id);
    if (outcome === "pinned") {
      announce(`${nameOf(id)} pinned as the reference A${describeRoles({ ...before, a: id })}`);
    } else if (outcome === "full") {
      announce(`The shortlist holds ${MAX_SHORTLIST}. Remove one to pin ${nameOf(id)}`);
    }
  },
  setCandidate(id) {
    const outcome = model.setCandidate(id);
    if (outcome === "changed") announce(`${nameOf(id)} is now compared as B`);
    else if (outcome === "is-reference") announce(`${nameOf(id)} is the reference A`);
    else if (outcome === "full") {
      announce(`The shortlist holds ${MAX_SHORTLIST}. Remove one to compare ${nameOf(id)}`);
    }
  },
  swapRoles() {
    if (!model.swapRoles()) return;
    announce(
      `${nameOf(model.referenceId.value)} is now the reference A, ${nameOf(model.candidateId.value)} is B`,
    );
  },
  async decide(id) {
    if (!model.decide(id)) return;
    announce(`${nameOf(id)} chosen`);
    await nextTick();
    root.value?.querySelector<HTMLElement>("[data-testid='studio-reason']")?.focus();
  },
  async clearDecision() {
    model.clearDecision();
    announce("Decision cleared");
    await nextTick();
    root.value?.querySelector<HTMLElement>("[data-testid='studio-choose-a']")?.focus();
  },
  openDetail(id, source) {
    present(
      "detail",
      1,
      () => {
        model.inspect(id);
        if (!wide.value) model.setView("candidates");
      },
      {
        region: candidates.value?.root(),
        shared: { source, destination: detailGlyph },
        afterUpdate: () => candidates.value?.heading()?.focus({ preventScroll: true }),
      },
    );
  },
  closeDetail() {
    const id = model.inspectedId.value;
    if (id === undefined) return;
    present("detail", -1, () => model.inspect(undefined), {
      region: candidates.value?.root(),
      shared: {
        source: detailGlyph(),
        destination: () =>
          root.value?.querySelector<HTMLElement>(
            `[data-candidate-row="${id}"] [data-shared-glyph]`,
          ) ?? undefined,
      },
      afterUpdate: () => candidates.value?.focusRowOpener(id),
    });
  },
  setView(view) {
    if (model.view.value === view) return;
    announce(`${view === "compare" ? "Compare" : "Candidates"} view`);
    present("view", view === "compare" ? 1 : -1, () => model.setView(view), {
      region: layout.value,
    });
  },
  openImplementation(id, opener) {
    sheetOpener.value = opener;
    model.openSheet(id);
  },
  tuneB(patch: TunePatch) {
    const outcome = tuneCandidateB(model, custom, behavior, patch);
    const shape = describeShape(customBehavior.value);
    if (outcome === "forked") {
      continuity.forked = true;
      announce(`Copied into Custom. B is now ${shape}`);
    } else if (outcome === "updated") {
      // Layout, exchange and preset changes are announced; a slider drag is not, because it would
      // speak on every step.
      if (patch.surface || patch.exchange || patch.base) announce(`B is now ${shape}`);
    } else if (outcome === "reference-is-custom") {
      announce(
        "Custom is the reference A, so it cannot also be B's copy. Swap A and B to change it.",
      );
    } else if (outcome === "no-b") {
      announce("Shortlist a candidate to compare as B first");
    }
  },
  copyTuningToB() {
    commands.tuneB({ base: tuning.preset.value, settings: { ...tuning.settings.value } });
    announce("Copied the Playground's motion tuning into B");
  },
  setShortlistExchange(exchange: ShortlistExchange) {
    if (model.shortlistExchange.value === exchange) return;
    model.setShortlistExchange(exchange);
    announce(`Shortlist cards now turn with ${exchange === "direct" ? "Direct" : "Shuffle"}`);
  },
  openMedia(request) {
    mediaOrigin = { role: request.role, id: request.id };
    mediaOpener.value = request.opener;
    const update = () => void model.openMedia(request.id);
    // A snapshot is only ever taken of a picture that is already still. A photo that had to travel,
    // or a surface that was still moving, opens with no transition: the motion is what is being
    // judged and a snapshot would replace it.
    if (request.atRest && request.source && !model.overlayOpen.value) {
      present("media", 1, update, {
        shared: { source: request.source, destination: viewerPhoto },
      });
    } else {
      update();
    }
  },
  closeMedia() {
    const origin = mediaOrigin;
    const returnTo = origin ? restingThumbnail(origin.role, origin.id) : undefined;
    const update = () => model.requestClose();
    if (returnTo && viewerPhoto()) {
      present("media", -1, update, {
        shared: { source: viewerPhoto(), destination: () => returnTo },
      });
    } else {
      update();
    }
  },
  goToCandidates() {
    const focusFirst = () =>
      root.value
        ?.querySelector<HTMLElement>("[data-testid='studio-candidate-list'] [data-open-detail]")
        ?.focus();
    if (wide.value || model.view.value === "candidates") {
      focusFirst();
      return;
    }
    announce("Candidates view");
    present("view", -1, () => model.setView("candidates"), {
      region: layout.value,
      afterUpdate: focusFirst,
    });
  },
};

provide(studioKey, { announce, behavior, commands, continuity, custom, media, model });

// ---------------------------------------------------------------------------------- sheet

const sheetOpen = computed(() => model.overlay.value === "sheet" && model.overlayOpen.value);
const sheetSide = computed(() => (wide.value ? "right" : "bottom"));
const sheetFocusReturn = computed<FocusReturnOptions>(() => ({
  ...(sheetOpener.value ? { opener: sheetOpener.value } : {}),
  fallback: () => root.value,
}));
const mediaOpen = computed(() => model.overlay.value === "media" && model.overlayOpen.value);
const mediaFocusReturn = computed<FocusReturnOptions>(() => ({
  ...(mediaOpener.value ? { opener: mediaOpener.value } : {}),
  fallback: () => root.value,
}));

defineExpose({ focus: () => root.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    ref="root"
    class="studio"
    :aria-labelledby="titleId"
    data-testid="studio-workspace"
    :data-layout="wide ? 'wide' : 'narrow'"
    tabindex="-1"
  >
    <header class="studio-bar">
      <div class="studio-identity">
        <h3 :id="titleId" class="studio-name">Motion Studio</h3>
        <p class="studio-question">
          How should browsing the photos in a conversation feel? Compare two behaviours on the same
          photos, tune B, and decide.
        </p>
      </div>
      <div class="studio-state">
        <p class="studio-summary tabular" data-testid="studio-summary">{{ summaryText }}</p>
        <p class="studio-decision" data-testid="studio-decision-line">{{ decisionText }}</p>
      </div>
      <a class="studio-motion" data-testid="studio-motion" href="#studio-tuning">
        <span class="studio-motion-label">Your tuning</span>
        <strong>{{ motionLabel }}</strong>
        <span class="sr-only">. Go to motion tuning</span>
      </a>
    </header>

    <div v-if="!wide" class="studio-modes">
      <SegmentedControl
        label="Workspace view"
        label-hidden
        :model-value="model.view.value"
        :options="viewOptions"
        @update:model-value="commands.setView"
      />
    </div>

    <div ref="layout" class="studio-layout" data-testid="studio-layout">
      <template v-if="wide">
        <!-- The shortlist leads the column so the Deck that chooses B sits level with the stages it
        drives; the candidates to add from follow it. -->
        <div class="area-choose">
          <StudioShortlist ref="shortlist" :reduced-motion-override="reducedMotionOverride" />
          <StudioCandidates ref="candidates" :reduced-motion-override="reducedMotionOverride" />
        </div>
        <StudioCompare class="area-compare" :reduced-motion-override="reducedMotionOverride" />
      </template>
      <template v-else>
        <StudioCandidates
          v-if="model.view.value === 'candidates'"
          ref="candidates"
          :reduced-motion-override="reducedMotionOverride"
        />
        <StudioCompare v-else :reduced-motion-override="reducedMotionOverride">
          <template #shortlist>
            <StudioShortlist ref="shortlist" :reduced-motion-override="reducedMotionOverride" />
          </template>
        </StudioCompare>
      </template>
    </div>

    <StudioMediaViewer
      :focus-return="mediaFocusReturn"
      :open="mediaOpen"
      @closed="model.completeClose()"
      @request-close="commands.closeMedia()"
    />

    <StudioSheet
      :focus-return="sheetFocusReturn"
      :open="sheetOpen"
      :reduced-motion-override="reducedMotionOverride"
      :settings="settings"
      :side="sheetSide"
      @closed="model.completeClose()"
      @request-close="model.requestClose()"
    />

    <p class="sr-only" role="status" aria-atomic="true" data-testid="studio-status">
      {{ statusText }}
    </p>
  </section>
</template>

<style>
/*
 * The workspace's shared presentation. It is unscoped on purpose: the regions are separate
 * components that compose one layout, so they share these classes rather than each restating them.
 * Everything is prefixed or lives under `.studio`, and nothing here styles another section.
 */
.studio {
  --stage: #e9e5d9;

  display: grid;
  gap: 0;
  min-inline-size: 0;
  border-block: 1px solid var(--pg-ink);
}

.studio:focus {
  outline: none;
}

.studio:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 4px;
}

.studio-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
  padding-block: 0.9rem;
  border-block-end: 1px solid var(--pg-line);
}

.studio-identity {
  display: grid;
  gap: 0.2rem;
  max-inline-size: 34rem;
}

.studio-name {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.studio-question {
  color: var(--pg-ink-soft);
  font-size: 0.9rem;
  line-height: 1.4;
}

.studio-state {
  display: grid;
  flex: 1 1 14rem;
  gap: 0.15rem;
}

.studio-summary {
  color: var(--pg-ink);
  font-family: var(--pg-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.03em;
}

.studio-decision {
  color: var(--pg-muted);
  font-size: 0.82rem;
}

.studio-motion {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-block-size: 2.25rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--pg-line);
  border-radius: 999px;
  color: var(--pg-ink);
  font-size: 0.85rem;
  text-decoration: none;
}

.studio-motion:hover {
  border-color: var(--pg-ink);
}

/* A finger needs 44px. */
@media (pointer: coarse) {
  .studio-motion {
    min-block-size: 2.75rem;
  }
}

.studio-motion-label {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.studio-modes {
  padding-block: 0.75rem;
  border-block-end: 1px solid var(--pg-line);
}

.studio-modes .segmented-options {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  inline-size: 100%;
}

.studio-modes .segmented,
.studio-modes .segmented-options {
  inline-size: 100%;
}

.studio-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
}

.studio-region {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  min-inline-size: 0;
  padding-block: 1.25rem;
}

.region-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.region-kicker {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.region-title {
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.region-count {
  padding-block-start: 0.25rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.75rem;
}

.studio-button {
  min-block-size: 2.75rem;
  padding: 0.35rem 0.95rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.studio-button-primary {
  border-color: var(--pg-ink);
  background: var(--pg-ink);
  color: var(--pg-white);
}

.studio-button-primary:hover:not(:disabled) {
  background: var(--pg-ink-soft);
}

.studio-button:disabled {
  background: transparent;
}

/* Wide: choosing on one side, comparing on the other, so what is picked and what runs share a view. */
@media (min-width: 62rem) {
  .studio-layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: start;
  }

  .area-choose {
    display: grid;
    min-inline-size: 0;
    padding-inline-end: clamp(1.25rem, 2.5vw, 2rem);
  }

  .area-choose > .studio-candidates {
    border-block-start: 1px solid var(--pg-line);
  }

  .area-compare {
    padding-inline-start: clamp(1.25rem, 2.5vw, 2rem);
    border-inline-start: 1px solid var(--pg-line);
  }
}

/*
 * Native View Transitions. The Studio names a region only for the length of one transition (see
 * studio-transition.ts); these rules style the pseudo-elements that exist only while one runs. The
 * root's own cross-fade is switched off so the frozen page around the Studio cannot flicker.
 */
@media (prefers-reduced-motion: no-preference) {
  :root[data-studio-transition]::view-transition-group(root) {
    animation: none;
  }

  :root[data-studio-transition]::view-transition-old(root) {
    display: none;
  }

  :root[data-studio-transition]::view-transition-new(root) {
    animation: none;
  }

  :root {
    --studio-vt-shift: 1;
  }

  :root[data-studio-direction="back"] {
    --studio-vt-shift: -1;
  }

  ::view-transition-group(studio-view),
  ::view-transition-group(studio-detail) {
    animation-duration: 260ms;
    animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }

  ::view-transition-old(studio-view),
  ::view-transition-old(studio-detail) {
    animation: studio-vt-out 160ms cubic-bezier(0.4, 0, 1, 1) both;
  }

  ::view-transition-new(studio-view),
  ::view-transition-new(studio-detail) {
    animation: studio-vt-in 260ms cubic-bezier(0, 0, 0.2, 1) both;
  }

  ::view-transition-group(studio-glyph) {
    animation-duration: 340ms;
    animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }

  /* A photo going to or from the viewer travels above the dialog's own top layer. */
  ::view-transition-group(studio-photo) {
    z-index: 2147483647;
    animation-duration: 340ms;
    animation-timing-function: cubic-bezier(0.22, 0.8, 0.2, 1);
  }

  @keyframes studio-vt-out {
    to {
      opacity: 0;
      transform: translateX(calc(var(--studio-vt-shift) * -18px));
    }
  }

  @keyframes studio-vt-in {
    from {
      opacity: 0;
      transform: translateX(calc(var(--studio-vt-shift) * 18px));
    }
  }
}
</style>
