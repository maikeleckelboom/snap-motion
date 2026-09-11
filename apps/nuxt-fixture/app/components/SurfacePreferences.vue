<script setup lang="ts">
import {
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue/carousel";
import { Coverflow, type CoverflowHandle } from "@snap-motion/vue/coverflow";
import { Sheet, type SheetDiagnostics } from "@snap-motion/vue/sheet";
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { nextTick, normalizeStyle, onMounted, ref, type ObjectDirective, type VNode } from "vue";

const props = defineProps<{
  preference?: boolean | undefined;
  cardWidth?: number | undefined;
  allocation?: number | undefined;
}>();
const screens = ref([
  { id: "templates", title: "Project templates" },
  { id: "project", title: "Project overview" },
  { id: "team", title: "Team workspace" },
]);
const coverflow = ref<CoverflowHandle<string>>();
const sheet = ref<{ readonly diagnostics: SheetDiagnostics }>();
const activeId = ref<string | undefined>();
const controlled = ref(false);
const sheetOpen = ref(false);
const carouselId = ref("two");
const ready = ref(false);
const requests = ref<string[]>([]);
const settlements = ref<string[]>([]);

// Read the actual first hydrating VNodes, before mounted preference/measurement adoption.
// This observes package output; it neither mutates it nor intercepts Vue diagnostics.
const vProbe: ObjectDirective<HTMLElement, string> = {
  beforeMount(element, binding, vnode) {
    const nodes: Record<string, unknown>[] = [];
    function visit(node: VNode) {
      if (typeof node.type === "string") {
        const attributes = node.props ?? {};
        nodes.push({
          tag: node.type,
          class: attributes.class,
          style: normalizeStyle(attributes.style),
          attributes: Object.fromEntries(
            Object.entries(attributes).filter(
              ([key]) => key.startsWith("data-") || key.startsWith("aria-") || key === "inert",
            ),
          ),
        });
      }
      if (node.component?.subTree) visit(node.component.subTree);
      if (Array.isArray(node.children)) {
        for (const child of node.children)
          if (child && typeof child === "object" && "type" in child) visit(child as VNode);
      }
    }
    visit(vnode);
    window.dispatchEvent(
      new CustomEvent("snap-motion:hydration-probe", {
        detail: { surface: binding.value, serverDom: element.outerHTML, firstRender: nodes },
      }),
    );
  },
};

onMounted(async () => {
  await nextTick();
  ready.value = true;
});

function request(id: string | undefined) {
  requests.value.push(id ?? "none");
  if (controlled.value) activeId.value = id;
}
</script>

<template>
  <main class="surface-preferences" :data-preference-ready="ready ? '' : undefined">
    <section class="evidence" :style="{ maxInlineSize: `${props.allocation ?? 1120}px` }">
      <h1>Product evidence</h1>
      <p>Three views of the same workspace</p>
      <Coverflow
        ref="coverflow"
        v-probe="'coverflow'"
        :items="screens"
        :active-id="activeId"
        v-bind="props.preference === undefined ? {} : { reducedMotionOverride: props.preference }"
        :card-width="props.cardWidth"
        label="Product screenshots"
        :data-settled-id="coverflow?.settledId"
        :data-position="coverflow?.diagnostics.position"
        :data-pitch="coverflow?.pitch"
        @active-id-request="request"
        @settled="(id) => settlements.push(id)"
      >
        <template #card="{ item, active, visual, settled }">
          <img
            :src="`/screens/${item.id}.svg`"
            :alt="item.title"
            width="1600"
            height="1120"
            :data-card-active="active"
            :data-card-visual="visual"
            :data-card-settled="settled"
          />
        </template>
      </Coverflow>
      <nav aria-label="Evidence navigation">
        <button type="button" @click="coverflow?.previous()">Previous screenshot</button>
        <button type="button" @click="coverflow?.next()">Next screenshot</button>
      </nav>
    </section>
    <section class="audit-surfaces">
      <button
        type="button"
        @click="
          controlled = !controlled;
          activeId = controlled ? coverflow?.activeId : undefined;
        "
      >
        Toggle controlled
      </button>
      <button type="button" @click="screens = [...screens].reverse()">Reverse collection</button>
      <output
        data-preference-state
        :data-sheet-reduced="sheet?.diagnostics.reducedMotion"
        :data-controlled="controlled"
        :data-requests="requests.join(',')"
        :data-settlements="settlements.join(',')"
      />
      <StackedDeck
        v-probe="'deck'"
        :items="screens"
        v-bind="props.preference === undefined ? {} : { reducedMotionOverride: props.preference }"
        label="Deck audit"
      >
        <template #card="{ item }"
          ><p>{{ item.title }}</p></template
        >
      </StackedDeck>
      <CarouselRoot
        v-probe="'carousel'"
        :ids="['one', 'two']"
        v-model:active-id="carouselId"
        v-bind="props.preference === undefined ? {} : { reducedMotionOverride: props.preference }"
        label="Carousel audit"
      >
        <CarouselViewport
          ><CarouselTrack>
            <CarouselSlide id="one" label="One">One</CarouselSlide
            ><CarouselSlide id="two" label="Two">Two</CarouselSlide>
          </CarouselTrack></CarouselViewport
        >
      </CarouselRoot>
      <button type="button" @click="sheetOpen = true">Open audit sheet</button>
      <Sheet
        ref="sheet"
        v-probe="'sheet'"
        v-model:open="sheetOpen"
        v-bind="props.preference === undefined ? {} : { reducedMotionOverride: props.preference }"
      >
        <template #title>Sheet audit</template>
        <p>Sheet content</p>
      </Sheet>
    </section>
  </main>
</template>

<style scoped>
.surface-preferences {
  color: #18263a;
  background: #f6f7f9;
  padding: 24px 16px;
  font: 16px/1.5 system-ui;
}
.evidence {
  margin-inline: auto;
  min-inline-size: 0;
}
h1 {
  margin: 0;
  font-size: 28px;
}
p {
  margin-block: 8px 20px;
}
img {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
}
nav {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
button {
  font: inherit;
  padding: 8px 12px;
}
.audit-surfaces {
  margin-block-start: 80px;
}
</style>
