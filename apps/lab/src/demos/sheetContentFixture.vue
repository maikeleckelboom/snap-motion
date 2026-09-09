<script setup lang="ts">
import type { InitialFocus } from "@snap-motion/vue/dialog";
import {
  Sheet,
  sheetSnapVisibleExtent,
  type SheetDiagnostics,
  type SheetSide,
  type SheetSnapPoint,
} from "@snap-motion/vue/sheet";
import { computed, onBeforeUnmount, ref } from "vue";

type Treatment = "control" | "reveal" | "offset";
type Snap = "full" | "partial" | "content";
interface SheetInstance {
  diagnostics: SheetDiagnostics<Snap>;
  navigateTo: (id: Snap) => boolean;
  requestClose: () => void;
  closeForPresentationChange: () => boolean;
}

const open = ref(false);
const side = ref<SheetSide>("top");
const treatment = ref<Treatment>("control");
const content = ref("menu");
const activeId = ref<Snap>("full");
const overshoot = ref("responsive");
const checks =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("checks");
const preference = ref("system");
const initialFocus = ref<"close" | "first-interactive" | "body">("close");
const sheet = ref<SheetInstance>();
const opener = ref<HTMLButtonElement>();
const presentedBody = ref<HTMLElement>();
const resolvedInitialFocus = computed<InitialFocus>(() =>
  initialFocus.value === "body"
    ? () => presentedBody.value?.querySelector<HTMLElement>("a, input, button") ?? undefined
    : initialFocus.value,
);
const noteCount = ref(3);
const selectedPage = ref("Overview");
let reveal: Animation | undefined;
const points: readonly SheetSnapPoint<Snap>[] = [
  { id: "full", label: "Full", resolveVisibleExtent: sheetSnapVisibleExtent.viewportFraction(1) },
  { id: "partial", label: "Partial", resolveVisibleExtent: sheetSnapVisibleExtent.pixels(280) },
  {
    id: "content",
    label: "Content",
    resolveVisibleExtent: sheetSnapVisibleExtent.intrinsicContent,
  },
];
const preferenceProps = computed(() =>
  preference.value === "system" ? {} : { reducedMotionOverride: preference.value === "reduce" },
);
const focusReturn = computed(() => ({ opener: opener.value }));
const viewportPolicy = computed(() => ({
  hiddenOvershoot: overshoot.value === "baseline" ? 160 : 1,
}));

// Lab-only comparison: one body participant, unchanged package panel physics. This is deliberately
// not a consumer recipe or a public Sheet API. A close/reopen never rewinds an unfinished reveal.
function present() {
  if (
    reveal?.playState === "running" ||
    treatment.value === "control" ||
    sheet.value?.diagnostics.reducedMotion
  )
    return;
  const body = presentedBody.value;
  if (!body) return;
  const shift = treatment.value === "offset" ? 8 : 0;
  const transform =
    side.value === "top"
      ? `translateY(${-shift}px)`
      : side.value === "bottom"
        ? `translateY(${shift}px)`
        : side.value === "left"
          ? `translateX(${-shift}px)`
          : `translateX(${shift}px)`;
  reveal = body.animate(
    [
      { opacity: 0.55, transform },
      { opacity: 1, transform: "translate(0, 0)" },
    ],
    { duration: 140, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  );
}
function showFocusedContent() {
  reveal?.finish();
}
function closed() {
  reveal?.cancel();
  reveal = undefined;
}
function navigate(label: string) {
  selectedPage.value = label;
  open.value = false;
}
onBeforeUnmount(closed);
</script>

<template>
  <section class="sheet-content-comparison" data-testid="sheet-content-fixture">
    <div class="sheet-comparison-controls">
      <label
        >Treatment<select v-model="treatment" data-testid="content-treatment">
          <option value="control">Control</option>
          <option value="reveal">Soft reveal · 140 ms</option>
          <option value="offset">Soft reveal + 8 px</option>
        </select></label
      >
      <label
        >Hidden travel<select v-model="overshoot" data-testid="hidden-travel">
          <option value="baseline">Baseline · 160 px</option>
          <option value="responsive">Edge · 1 px</option>
        </select></label
      >
      <label
        >Side<select v-model="side" data-testid="content-side">
          <option>top</option>
          <option>bottom</option>
          <option>left</option>
          <option>right</option>
        </select></label
      >
      <label
        >Content<select v-model="content" data-testid="content-kind">
          <option value="menu">Menu</option>
          <option value="form">Form</option>
          <option value="prose">Long text</option>
          <option value="media">Media</option>
          <option value="short">Short body</option>
        </select></label
      >
      <label
        >Open snap<select v-model="activeId" data-testid="content-snap">
          <option value="full">Full</option>
          <option value="partial">Partial</option>
          <option value="content">Content sized</option>
        </select></label
      >
      <label
        >Motion preference<select v-model="preference" data-testid="content-preference">
          <option value="system">System · prop omitted</option>
          <option value="reduce">Explicit true</option>
          <option value="animate">Explicit false</option>
        </select></label
      >
      <label
        >Initial focus<select v-model="initialFocus" data-testid="content-initial-focus">
          <option value="close">Close</option>
          <option value="first-interactive">First interactive</option>
          <option value="body">Body control · custom resolver</option>
        </select></label
      >
    </div>
    <header class="comparison-site-header">
      <strong>North Studio</strong
      ><button
        ref="opener"
        data-testid="content-open"
        type="button"
        :aria-expanded="open"
        @click="open = true"
      >
        Menu
      </button>
    </header>
    <div class="comparison-page">
      <p>Independent design & engineering</p>
      <h2>{{ selectedPage }}</h2>
      <p>
        A representative compact menu. The title and close control remain available while the body
        enters.
      </p>
    </div>
    <Sheet
      :key="overshoot"
      ref="sheet"
      v-model:open="open"
      v-model:active-id="activeId"
      class="comparison-sheet"
      data-testid="content-sheet"
      :data-reduced-motion="sheet?.diagnostics.reducedMotion"
      :side="side"
      :snap-points="points"
      :show-snap-picker="false"
      :initial-focus="resolvedInitialFocus"
      :focus-return="focusReturn"
      :viewport-policy="viewportPolicy"
      v-bind="preferenceProps"
      @opened="present"
      @closed="closed"
    >
      <template #title><h2>Menu</h2></template>
      <template #close><span aria-hidden="true">×</span></template>
      <div
        ref="presentedBody"
        class="comparison-body"
        data-testid="presented-body"
        @focusin="showFocusedContent"
      >
        <div v-if="checks" class="sheet-comparison-controls">
          <label
            >Live side<select v-model="side" data-testid="content-live-side">
              <option>top</option>
              <option>bottom</option>
              <option>left</option>
              <option>right</option>
            </select></label
          >
          <label
            >Live snap<select v-model="activeId" data-testid="content-live-snap">
              <option value="full">Full</option>
              <option value="partial">Partial</option>
              <option value="content">Content</option>
            </select></label
          >
          <label
            >Live preference<select v-model="preference" data-testid="content-live-preference">
              <option value="system">System</option>
              <option value="reduce">Reduce</option>
              <option value="animate">Animate</option>
            </select></label
          >
          <button data-testid="content-reopen" type="button" @click="open = true">Reopen</button>
        </div>
        <template v-if="content === 'menu'">
          <nav aria-label="Main navigation">
            <a
              v-for="label in ['Overview', 'Projects', 'About', 'Contact']"
              :key="label"
              :href="`#${label.toLowerCase()}`"
              @click.prevent="navigate(label)"
              >{{ label }}</a
            >
          </nav>
          <section class="comparison-utilities" aria-label="Preferences">
            <label
              >Language<select>
                <option>English</option>
                <option>Nederlands</option>
              </select></label
            >
            <fieldset>
              <legend>Appearance</legend>
              <label><input type="radio" name="appearance" checked /> System</label
              ><label><input type="radio" name="appearance" /> Light</label
              ><label><input type="radio" name="appearance" /> Dark</label>
            </fieldset>
            <details>
              <summary>More options</summary>
              <label><input type="checkbox" /> Remember this device</label>
            </details>
          </section>
        </template>
        <form v-else-if="content === 'form'" @submit.prevent="open = false">
          <label>Your name<input name="name" autocomplete="name" /></label
          ><label>Email<input name="email" type="email" autocomplete="email" /></label
          ><label>Message<textarea rows="6" /></label
          ><label><input type="checkbox" /> Send me a copy</label
          ><button type="submit">Send message</button>
        </form>
        <template v-else-if="content === 'prose'"
          ><h3>Making space for good work</h3>
          <p v-for="index in 10" :key="index">
            Useful interfaces let people decide at their own pace. Clear writing, reliable controls
            and familiar movement make it easier to concentrate. This long text keeps its natural
            line wrapping as the visible surface changes.
          </p></template
        >
        <template v-else-if="content === 'media'"
          ><figure>
            <svg viewBox="0 0 480 320" role="img" aria-label="Architectural study">
              <rect width="480" height="320" fill="#d8d2c3" />
              <path d="M80 280V120L240 40l160 80v160Z" fill="#535e64" />
              <path d="M240 40v240H80V120Z" fill="#87928f" />
            </svg>
            <figcaption>Study of a quiet courtyard</figcaption>
          </figure>
          <button type="button">View details</button></template
        >
        <p v-else>A short body stays readable at its content-sized snap.</p>
        <section class="comparison-extra">
          <button data-testid="content-add" type="button" @click="noteCount += 1">
            Add a note
          </button>
          <p v-for="index in noteCount" :key="index">
            Note {{ index }} · Native scrolling stays independent.
          </p>
        </section>
      </div>
    </Sheet>
  </section>
</template>

<style scoped>
.sheet-content-comparison {
  color: var(--ink);
}
.sheet-comparison-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-block-end: 2rem;
}
.sheet-comparison-controls label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.75rem;
}
.sheet-comparison-controls select {
  max-inline-size: 15rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  background: var(--paper);
}
.comparison-site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 1rem;
  border-block: 1px solid var(--line);
}
.comparison-site-header button {
  padding: 0.8rem 1rem;
}
.comparison-page {
  max-inline-size: 34rem;
  padding-block: 3rem;
}
.comparison-page h2 {
  font-size: 3rem;
}
.comparison-sheet {
  --snap-motion-sheet-content-padding-inline: 1.5rem;
  font-family: Arial, sans-serif;
}
:deep(.comparison-sheet .snap-motion-sheet-panel),
:deep(.comparison-sheet .snap-motion-sheet-viewport) {
  background: #f5f3ed;
  color: #202624;
}
:deep(.comparison-sheet .snap-motion-sheet-header) {
  min-block-size: 76px;
  border-block-end: 1px solid #c8cdc8;
}
:deep(.comparison-sheet .snap-motion-sheet-title h2) {
  margin: 0;
  font-size: 1.15rem;
}
:deep(.comparison-sheet .snap-motion-sheet-close) {
  display: grid;
  place-items: center;
  min-inline-size: 44px;
  min-block-size: 44px;
  background: transparent;
  font-size: 2rem;
}
.comparison-body {
  padding-block: 2rem;
}
.comparison-body nav {
  display: grid;
  gap: 0.3rem;
}
.comparison-body nav a {
  width: fit-content;
  color: inherit;
  font-size: clamp(2rem, 9vw, 3rem);
  line-height: 1.2;
  text-decoration: none;
  padding-block: 0.25rem;
}
.comparison-utilities {
  display: grid;
  gap: 1.25rem;
  margin-block-start: 2rem;
  padding-block-start: 1.5rem;
  border-block-start: 1px solid #c8cdc8;
}
.comparison-body form {
  display: grid;
  gap: 1.5rem;
}
.comparison-body form > label {
  display: grid;
  gap: 0.5rem;
}
.comparison-body input:not([type="checkbox"], [type="radio"]),
.comparison-body textarea,
.comparison-body select {
  padding: 0.6rem;
  border: 1px solid #9baba3;
  background: #fff;
  color: #202624;
  max-inline-size: 100%;
}
.comparison-body fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  border: 0;
  margin: 0;
  padding: 0;
}
.comparison-body legend {
  margin-block-end: 0.75rem;
}
.comparison-body button,
.comparison-body summary {
  min-block-size: 44px;
}
.comparison-body p {
  line-height: 1.55;
}
.comparison-body figure {
  margin: 0;
}
.comparison-body svg {
  display: block;
  width: 100%;
  height: auto;
}
.comparison-extra {
  margin-block-start: 2rem;
  font-size: 0.85rem;
}
:global(html:has(.comparison-sheet[open])),
:global(html:has(.comparison-sheet[open]) body) {
  overflow: hidden;
}
</style>
