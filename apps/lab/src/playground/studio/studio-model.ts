import { computed, ref, type ComputedRef, type Ref } from "vue";

/**
 * The Motion Studio's application model: the one owner of what the visitor has selected, compared,
 * edited and opened. Surfaces read it and ask it to change; none of them keeps a copy.
 *
 * Identity is always a stable study ID, never an index. Three ideas are kept deliberately apart:
 *
 * - `activeId` is the study the visitor is working on, anywhere in the workspace. It is always in
 *   the collection and need not be in the comparison.
 * - `deckId` is the comparison cursor: the card the Deck names. It is always a member of the
 *   comparison, or `undefined` when the comparison is empty. It follows `activeId` only when the
 *   active study is a member, so selecting a study outside the comparison never forces the Deck to
 *   target an ID it does not contain, and never adds that study to it.
 * - `overlay` is the single overlay that owns modality. The Gallery and the Sheet are native
 *   modals; this model never describes two of them as open at once.
 *
 * Nothing here knows about motion. A surface's gesture, target and settlement are its own; this
 * model only records the accepted outcome.
 */

/** A small deck: enough to exchange meaningfully, few enough to read as one pile. */
export const MAX_COMPARISON = 5;
/** The Deck needs a neighbour to exchange with. Below this the comparison is shown as plain state. */
export const MIN_DECK = 2;
export const NOTE_LIMIT = 240;

export type StudioView = "browse" | "explore" | "compare";
export type StudioDensity = "comfortable" | "compact";
export type StudioOverlay = "none" | "gallery" | "sheet";
export type DeckState = "empty" | "single" | "deck";

export type SelectionOutcome = "changed" | "unchanged" | "unknown";
export type ComparisonOutcome = "added" | "removed" | "duplicate" | "full" | "unknown" | "missing";

export interface StudioModelOptions<Id extends string, Category extends string = string> {
  /** The canonical collection, in order. */
  readonly ids: readonly Id[];
  readonly initialActiveId?: Id | undefined;
  readonly initialComparisonIds?: readonly Id[] | undefined;
  /** Maps a study to its category, for the collection filter. */
  readonly categoryOf?: ((id: Id) => Category) | undefined;
  /** Maps a Gallery media ID to the study that owns it. */
  readonly ownerOfMedia?: ((mediaId: string) => Id | undefined) | undefined;
  readonly mediaIdOf?: ((id: Id) => string) | undefined;
}

export interface StudioModel<Id extends string, Category extends string = string> {
  readonly ids: readonly Id[];
  readonly activeId: Readonly<Ref<Id>>;
  readonly comparisonIds: Readonly<Ref<readonly Id[]>>;
  readonly deckId: Readonly<Ref<Id | undefined>>;
  readonly deckState: ComputedRef<DeckState>;
  readonly comparisonFull: ComputedRef<boolean>;
  readonly view: Readonly<Ref<StudioView>>;
  readonly filter: Readonly<Ref<Category | "all">>;
  readonly density: Readonly<Ref<StudioDensity>>;
  readonly visibleIds: ComputedRef<readonly Id[]>;
  readonly overlay: Readonly<Ref<StudioOverlay>>;
  /** The `open` state of the overlay that owns modality. */
  readonly overlayOpen: Readonly<Ref<boolean>>;
  /** The Gallery's controlled item: the plate being inspected, not a study. */
  readonly inspectionMediaId: Readonly<Ref<string | undefined>>;
  readonly notes: Readonly<Ref<Readonly<Record<string, string>>>>;
  isCompared(id: Id): boolean;
  hasId(id: string): id is Id;
  noteFor(id: Id): string;
  hasNote(id: Id): boolean;
  select(id: Id): SelectionOutcome;
  /** A card chosen on the Deck. It must belong to the comparison. */
  selectFromDeck(id: Id): boolean;
  addToComparison(id?: Id): ComparisonOutcome;
  removeFromComparison(id: Id): ComparisonOutcome;
  toggleComparison(id?: Id): ComparisonOutcome;
  setNote(id: Id, text: string): string;
  setView(view: StudioView): void;
  setFilter(filter: Category | "all"): void;
  setDensity(density: StudioDensity): void;
  openGallery(mediaId?: string): boolean;
  openSheet(): boolean;
  /** Records the plate the Gallery is showing. Unknown plates are refused. */
  setInspectionMedia(mediaId: string): boolean;
  /**
   * The visitor asked to leave the overlay. Closing is a request: modality stays with the overlay
   * until its native dialog has actually closed (`completeClose`).
   */
  requestClose(finalMediaId?: string): Id | undefined;
  /** Hands modality back after the native dialog closed. Returns a Gallery handoff, if one waited. */
  completeClose(): string | undefined;
  /** Asks the Gallery to open once the Sheet has finished closing. */
  handOffToGallery(mediaId: string): boolean;
}

export function createStudioModel<Id extends string, Category extends string = string>(
  options: StudioModelOptions<Id, Category>,
): StudioModel<Id, Category> {
  const ids = options.ids;
  if (ids.length === 0) throw new RangeError("The Studio needs at least one study.");
  const known = new Set<string>(ids);
  if (known.size !== ids.length) throw new RangeError("Study IDs must be unique.");
  const hasId = (id: string): id is Id => known.has(id);

  const activeId = ref<Id>(
    options.initialActiveId !== undefined && hasId(options.initialActiveId)
      ? options.initialActiveId
      : ids[Math.floor(ids.length / 2)]!,
  ) as Ref<Id>;
  const initialComparison = unique((options.initialComparisonIds ?? []).filter(hasId)).slice(
    0,
    MAX_COMPARISON,
  );
  const comparisonIds = ref<readonly Id[]>(initialComparison) as Ref<readonly Id[]>;
  const deckId = ref<Id | undefined>(
    initialComparison.includes(activeId.value) ? activeId.value : initialComparison[0],
  ) as Ref<Id | undefined>;
  const view = ref<StudioView>("browse");
  const filter = ref<Category | "all">("all") as Ref<Category | "all">;
  const density = ref<StudioDensity>("comfortable");
  const overlay = ref<StudioOverlay>("none");
  const overlayOpen = ref(false);
  // The Gallery's controlled item. It is kept after the Gallery closes so a closing dialog is never
  // handed an `undefined` authority mid-animation; the next open replaces it in the same tick.
  const inspectionMediaId = ref<string | undefined>(options.mediaIdOf?.(activeId.value));
  const notes = ref<Record<string, string>>({});
  let pendingGalleryMediaId: string | undefined;

  const deckState = computed<DeckState>(() =>
    comparisonIds.value.length === 0
      ? "empty"
      : comparisonIds.value.length < MIN_DECK
        ? "single"
        : "deck",
  );
  const comparisonFull = computed(() => comparisonIds.value.length >= MAX_COMPARISON);
  const visibleIds = computed<readonly Id[]>(() =>
    filter.value === "all" || options.categoryOf === undefined
      ? ids
      : ids.filter((id) => options.categoryOf!(id) === filter.value),
  );

  function isCompared(id: Id) {
    return comparisonIds.value.includes(id);
  }

  function select(id: Id): SelectionOutcome {
    if (!hasId(id)) return "unknown";
    const changed = activeId.value !== id;
    activeId.value = id;
    // The Deck follows the active study only when it already holds it.
    if (isCompared(id)) deckId.value = id;
    return changed ? "changed" : "unchanged";
  }

  function selectFromDeck(id: Id) {
    if (!isCompared(id)) return false;
    deckId.value = id;
    activeId.value = id;
    return true;
  }

  function addToComparison(id: Id = activeId.value): ComparisonOutcome {
    if (!hasId(id)) return "unknown";
    if (isCompared(id)) return "duplicate";
    if (comparisonFull.value) return "full";
    comparisonIds.value = [...comparisonIds.value, id];
    // The study just added is the one in hand, so the Deck shows it; a first member always becomes
    // the cursor so the Deck never holds a comparison without naming a card.
    if (id === activeId.value || deckId.value === undefined) deckId.value = id;
    return "added";
  }

  function removeFromComparison(id: Id): ComparisonOutcome {
    const index = comparisonIds.value.indexOf(id);
    if (index < 0) return "missing";
    const next = comparisonIds.value.filter((member) => member !== id);
    comparisonIds.value = next;
    // Same ordinal where possible: the card that slid into the removed slot, else the new last.
    if (deckId.value === id) deckId.value = next[Math.min(index, next.length - 1)];
    return "removed";
  }

  function toggleComparison(id: Id = activeId.value): ComparisonOutcome {
    return isCompared(id) ? removeFromComparison(id) : addToComparison(id);
  }

  function setNote(id: Id, text: string) {
    const next = text.slice(0, NOTE_LIMIT);
    const { [id]: _removed, ...rest } = notes.value;
    notes.value = next.trim() === "" ? rest : { ...rest, [id]: next };
    return next;
  }

  function noteFor(id: Id) {
    return notes.value[id] ?? "";
  }

  function hasNote(id: Id) {
    return (notes.value[id] ?? "").trim() !== "";
  }

  function openGallery(mediaId?: string) {
    if (overlay.value !== "none") return false;
    const requested = mediaId ?? options.mediaIdOf?.(activeId.value);
    if (requested === undefined) return false;
    overlay.value = "gallery";
    overlayOpen.value = true;
    inspectionMediaId.value = requested;
    return true;
  }

  function openSheet() {
    if (overlay.value !== "none") return false;
    overlay.value = "sheet";
    overlayOpen.value = true;
    return true;
  }

  function setInspectionMedia(mediaId: string) {
    if (overlay.value !== "gallery" || options.ownerOfMedia?.(mediaId) === undefined) return false;
    inspectionMediaId.value = mediaId;
    return true;
  }

  function requestClose(finalMediaId?: string) {
    if (overlay.value === "none" || !overlayOpen.value) return undefined;
    overlayOpen.value = false;
    if (overlay.value !== "gallery") return undefined;
    // Closing the Gallery returns on the study whose plate was showing, so every surface names it.
    const finalId = options.ownerOfMedia?.(finalMediaId ?? inspectionMediaId.value ?? "");
    if (finalId === undefined) return undefined;
    inspectionMediaId.value = finalMediaId ?? inspectionMediaId.value;
    select(finalId);
    return finalId;
  }

  function completeClose() {
    overlay.value = "none";
    overlayOpen.value = false;
    const pending = pendingGalleryMediaId;
    pendingGalleryMediaId = undefined;
    return pending;
  }

  function handOffToGallery(mediaId: string) {
    if (overlay.value !== "sheet" || !overlayOpen.value) return false;
    if (options.ownerOfMedia?.(mediaId) === undefined) return false;
    pendingGalleryMediaId = mediaId;
    overlayOpen.value = false;
    return true;
  }

  return {
    ids,
    activeId,
    comparisonIds,
    deckId,
    deckState,
    comparisonFull,
    view,
    filter,
    density,
    visibleIds,
    overlay,
    overlayOpen,
    inspectionMediaId,
    notes,
    isCompared,
    hasId,
    noteFor,
    hasNote,
    select,
    selectFromDeck,
    addToComparison,
    removeFromComparison,
    toggleComparison,
    setNote,
    setView(next) {
      view.value = next;
    },
    setFilter(next) {
      filter.value = next;
    },
    setDensity(next) {
      density.value = next;
    },
    openGallery,
    openSheet,
    setInspectionMedia,
    requestClose,
    completeClose,
    handOffToGallery,
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
