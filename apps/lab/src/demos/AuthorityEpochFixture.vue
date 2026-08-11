<script setup lang="ts">
import { Coverflow, type CoverflowHandle } from "@snap-motion/vue/coverflow";
import type { ActiveIdRequestDetails, SettlementDetails } from "@snap-motion/vue/motion";
import { StackedDeck, type StackedDeckHandle } from "@snap-motion/vue/stacked-deck";
import { computed, nextTick, ref } from "vue";

const baseItems = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
  { id: "d", title: "D" },
] as const;
const futureItem = { id: "future", title: "Future" } as const;
type Item = (typeof baseItems)[number] | typeof futureItem;
type ItemId = Item["id"];

const controlled = ref(true);
const controlledId = ref<ItemId>("a");
const futureVisible = ref(false);
const rail = ref<CoverflowHandle<ItemId>>();
const deck = ref<StackedDeckHandle<ItemId>>();
const requests = ref<string[]>([]);
const settlements = ref<string[]>([]);
const items = computed<readonly Item[]>(() =>
  futureVisible.value ? [...baseItems, futureItem] : baseItems,
);

function recordRequest(
  surface: "coverflow" | "deck",
  id: ItemId | undefined,
  details: ActiveIdRequestDetails,
) {
  requests.value.push(`${surface}:${id ?? "none"}:${details.reason}`);
}

function recordSettlement(surface: "coverflow" | "deck", id: ItemId, details: SettlementDetails) {
  settlements.value.push(`${surface}:${id}:${details.reason}`);
}

async function runUnavailableHandoff() {
  requests.value = [];
  settlements.value = [];
  futureVisible.value = false;
  controlledId.value = "a";
  controlled.value = true;
  await nextTick();
  rail.value?.synchronizeTo("a");
  deck.value?.synchronizeTo("a");
  controlled.value = false;
  await nextTick();
  rail.value?.navigateTo("b");
  deck.value?.navigateTo("b");
  await nextTick();
  controlledId.value = "future";
  controlled.value = true;
}

function rejectC() {
  rail.value?.navigateTo("c");
  deck.value?.navigateTo("c");
}

function revealFuture() {
  futureVisible.value = true;
}

function releaseControl() {
  controlled.value = false;
}
</script>

<template>
  <section aria-labelledby="authority-epoch-title" class="authority-epoch-fixture">
    <header>
      <h3 id="authority-epoch-title">In-flight ownership epoch proof</h3>
      <p>Run the unavailable handoff, wait for B, reject C, reveal FUTURE, then release control.</p>
    </header>

    <div class="authority-epoch-controls">
      <button data-testid="authority-run" type="button" @click="runUnavailableHandoff">
        Run unavailable handoff
      </button>
      <button data-testid="authority-reject-c" type="button" @click="rejectC">Reject C</button>
      <button data-testid="authority-reveal-future" type="button" @click="revealFuture">
        Reveal FUTURE
      </button>
      <button data-testid="authority-release" type="button" @click="releaseControl">
        Release control
      </button>
    </div>

    <output class="authority-epoch-state" data-testid="authority-state">
      <span data-testid="authority-controlled">{{
        controlled ? controlledId : "uncontrolled"
      }}</span>
      <span data-testid="authority-rail-active">{{ rail?.activeId ?? "none" }}</span>
      <span data-testid="authority-rail-settled">{{ rail?.settledId ?? "none" }}</span>
      <span data-testid="authority-deck-active">{{ deck?.activeId ?? "none" }}</span>
      <span data-testid="authority-deck-settled">{{ deck?.settledId ?? "none" }}</span>
      <span data-testid="authority-requests">{{ requests.join(",") }}</span>
      <span data-testid="authority-settlements">{{ settlements.join(",") }}</span>
    </output>

    <Coverflow
      ref="rail"
      data-testid="authority-rail"
      :items="items"
      :item-label="(item) => item.title"
      label="Authority proof Coverflow"
      v-bind="controlled ? { activeId: controlledId } : {}"
      @active-id-request="(id, details) => recordRequest('coverflow', id, details)"
      @settled="(id, details) => recordSettlement('coverflow', id, details)"
    >
      <template #card="card">
        <article class="authority-card">{{ card.item.title }}</article>
      </template>
    </Coverflow>

    <StackedDeck
      ref="deck"
      data-testid="authority-deck"
      :items="items"
      :item-label="(item) => item.title"
      label="Authority proof Stacked Deck"
      v-bind="controlled ? { activeId: controlledId } : {}"
      @active-id-request="(id, details) => recordRequest('deck', id, details)"
      @settled="(id, details) => recordSettlement('deck', id, details)"
    >
      <template #card="card">
        <article class="authority-card">{{ card.item.title }}</article>
      </template>
    </StackedDeck>
  </section>
</template>

<style scoped>
.authority-epoch-fixture {
  display: grid;
  gap: 1rem;
}

.authority-epoch-fixture h3,
.authority-epoch-fixture p {
  margin: 0;
}

.authority-epoch-controls,
.authority-epoch-state {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.authority-epoch-state {
  font-family: monospace;
}

.authority-card {
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.16);
  border-radius: 0.8rem;
  background: #fff;
  color: #0f172a;
  font-size: 2rem;
}
</style>
