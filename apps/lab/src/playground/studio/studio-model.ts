import { computed, ref, type ComputedRef, type Ref } from "vue";

/**
 * The Motion Studio's application model: the one owner of what the visitor has shortlisted,
 * compared, decided and opened. Surfaces read it and ask it to change; none keeps a copy.
 *
 * Identity is always a stable candidate ID, never an index. The comparison has explicit roles
 * instead of one overloaded "active" item:
 *
 * - `shortlist` is the ordered set the visitor is considering.
 * - `referenceId` (A) is the pinned reference every other candidate is compared against. It is a
 *   member of the shortlist whenever the shortlist is not empty, and `undefined` only when it is.
 * - `candidateId` (B) is the candidate being compared with A. It is a member of the shortlist other
 *   than A, or `undefined` when there is no such member.
 * - `decision` records which candidate was chosen, and why. It is independent of the shortlist: a
 *   decision survives the candidate leaving the shortlist.
 *
 * Presentation is kept apart from all of that and never becomes a selection:
 *
 * - `presentedCandidateId` mirrors the card a Deck is actually showing on top, reported by the Deck
 *   itself. During an exchange it trails `candidateId`. It exists only so text can name the card
 *   the visitor can see; nothing reads it as intent.
 * - `inspectedId` is which candidate's detail is open in the collection, or `undefined` for the list.
 * - `overlay` is the single native modal that owns modality.
 *
 * Nothing here knows about motion. A surface's gesture, target and settlement are its own; this
 * model only records the accepted outcome.
 */

/** A small shortlist: enough to exchange meaningfully, few enough to read as one pile. */
export const MAX_SHORTLIST = 4;
/** The Deck needs a neighbour to exchange with. Below this it is plain state, not a Deck. */
export const MIN_DECK = 2;
export const REASON_LIMIT = 240;

export type StudioView = "candidates" | "compare";
export type StudioOverlay = "none" | "sheet";
/** How many candidates the Deck holds: none, one (shown as state, not exchanged), or several. */
export type DeckState = "empty" | "single" | "deck";
/** What the comparison can show: nothing, only the reference, or both A and B. */
export type CompareState = "empty" | "reference-only" | "ready";

export type ShortlistOutcome = "added" | "removed" | "duplicate" | "full" | "unknown" | "missing";
export type PinOutcome = "pinned" | "unchanged" | "full" | "unknown";
export type CandidateOutcome = "changed" | "unchanged" | "is-reference" | "full" | "unknown";

export interface StudioModelOptions<Id extends string> {
  /** The canonical collection, in order. */
  readonly ids: readonly Id[];
  readonly initialShortlist?: readonly Id[] | undefined;
}

export interface StudioModel<Id extends string> {
  readonly ids: readonly Id[];
  readonly shortlist: Readonly<Ref<readonly Id[]>>;
  readonly referenceId: Readonly<Ref<Id | undefined>>;
  readonly candidateId: Readonly<Ref<Id | undefined>>;
  /** The shortlist without the reference: the candidates B can be. */
  readonly deckIds: ComputedRef<readonly Id[]>;
  readonly deckState: ComputedRef<DeckState>;
  readonly compareState: ComputedRef<CompareState>;
  readonly shortlistFull: ComputedRef<boolean>;
  readonly presentedCandidateId: Readonly<Ref<Id | undefined>>;
  /**
   * B as the visitor can see it: the card the Deck reports in front while one is mounted and
   * exchanging, otherwise the semantic B. Every name beside the Deck reads this, never the other.
   */
  readonly shownCandidateId: ComputedRef<Id | undefined>;
  readonly inspectedId: Readonly<Ref<Id | undefined>>;
  readonly decidedId: Readonly<Ref<Id | undefined>>;
  readonly reason: Readonly<Ref<string>>;
  readonly view: Readonly<Ref<StudioView>>;
  readonly overlay: Readonly<Ref<StudioOverlay>>;
  /** The `open` state of the overlay that owns modality. */
  readonly overlayOpen: Readonly<Ref<boolean>>;
  /** Which candidate the Sheet is describing. */
  readonly sheetId: Readonly<Ref<Id | undefined>>;
  hasId(id: string): id is Id;
  inShortlist(id: Id): boolean;
  addToShortlist(id: Id): ShortlistOutcome;
  removeFromShortlist(id: Id): ShortlistOutcome;
  toggleShortlist(id: Id): ShortlistOutcome;
  /** Pins a candidate as A, adding it to the shortlist when there is room. */
  pinReference(id: Id): PinOutcome;
  /** Chooses B. It must not be A; a candidate outside the shortlist is added when there is room. */
  setCandidate(id: Id): CandidateOutcome;
  /** Exchanges A and B. False when there is no B. */
  swapRoles(): boolean;
  /** Records the card the Deck is showing. It is presentation, never intent. */
  reportPresented(id: Id | undefined): void;
  inspect(id: Id | undefined): boolean;
  decide(id: Id): boolean;
  clearDecision(): void;
  setReason(text: string): string;
  setView(view: StudioView): void;
  openSheet(id: Id): boolean;
  /** The visitor asked to leave the Sheet. Modality stays until `completeClose`. */
  requestClose(): void;
  /** Hands modality back after the native dialog has actually closed. */
  completeClose(): void;
}

export function createStudioModel<Id extends string>(
  options: StudioModelOptions<Id>,
): StudioModel<Id> {
  const ids = options.ids;
  if (ids.length === 0) throw new RangeError("The Studio needs at least one candidate.");
  const known = new Set<string>(ids);
  if (known.size !== ids.length) throw new RangeError("Candidate IDs must be unique.");
  const hasId = (id: string): id is Id => known.has(id);

  const initial = unique((options.initialShortlist ?? []).filter(hasId)).slice(0, MAX_SHORTLIST);
  const shortlist = ref<readonly Id[]>(initial) as Ref<readonly Id[]>;
  const referenceId = ref<Id | undefined>(initial[0]) as Ref<Id | undefined>;
  const candidateId = ref<Id | undefined>(initial[1]) as Ref<Id | undefined>;
  const presentedCandidateId = ref<Id | undefined>() as Ref<Id | undefined>;
  const inspectedId = ref<Id | undefined>() as Ref<Id | undefined>;
  const decidedId = ref<Id | undefined>() as Ref<Id | undefined>;
  const reason = ref("");
  const view = ref<StudioView>("candidates");
  const overlay = ref<StudioOverlay>("none");
  const overlayOpen = ref(false);
  const sheetId = ref<Id | undefined>() as Ref<Id | undefined>;

  const deckIds = computed<readonly Id[]>(() =>
    shortlist.value.filter((id) => id !== referenceId.value),
  );
  const deckState = computed<DeckState>(() =>
    deckIds.value.length === 0 ? "empty" : deckIds.value.length < MIN_DECK ? "single" : "deck",
  );
  const compareState = computed<CompareState>(() =>
    shortlist.value.length === 0
      ? "empty"
      : deckIds.value.length === 0
        ? "reference-only"
        : "ready",
  );
  const shortlistFull = computed(() => shortlist.value.length >= MAX_SHORTLIST);
  const shownCandidateId = computed<Id | undefined>(() => {
    const presented = presentedCandidateId.value;
    // A report for a card that has since left the Deck is stale: it names nothing the visitor sees.
    return presented !== undefined && deckIds.value.includes(presented)
      ? presented
      : candidateId.value;
  });

  const inShortlist = (id: Id) => shortlist.value.includes(id);

  function addToShortlist(id: Id): ShortlistOutcome {
    if (!hasId(id)) return "unknown";
    if (inShortlist(id)) return "duplicate";
    if (shortlistFull.value) return "full";
    shortlist.value = [...shortlist.value, id];
    // The first member is the reference. After that a new member becomes B only when B is vacant, so
    // adding never changes a comparison already under way.
    if (referenceId.value === undefined) referenceId.value = id;
    else if (candidateId.value === undefined) candidateId.value = id;
    return "added";
  }

  function removeFromShortlist(id: Id): ShortlistOutcome {
    const index = shortlist.value.indexOf(id);
    if (index < 0) return "missing";
    const before = deckIds.value;
    const next = shortlist.value.filter((member) => member !== id);
    shortlist.value = next;

    if (id === referenceId.value) {
      // The reference left. B, if there is one, becomes the reference, so the comparison stays
      // meaningful; otherwise the first member left takes the role.
      const promoted = candidateId.value ?? next[0];
      referenceId.value = promoted;
      const remaining = next.filter((member) => member !== promoted);
      candidateId.value = remaining[0];
    } else if (id === candidateId.value) {
      // The card that took B's place in the Deck, else the new last.
      const position = before.indexOf(id);
      const remaining = before.filter((member) => member !== id);
      candidateId.value = remaining[Math.min(position, remaining.length - 1)];
    }
    if (inspectedId.value === id) inspectedId.value = undefined;
    return "removed";
  }

  function toggleShortlist(id: Id): ShortlistOutcome {
    return inShortlist(id) ? removeFromShortlist(id) : addToShortlist(id);
  }

  function pinReference(id: Id): PinOutcome {
    if (!hasId(id)) return "unknown";
    if (id === referenceId.value) return "unchanged";
    if (!inShortlist(id)) {
      if (shortlistFull.value) return "full";
      shortlist.value = [...shortlist.value, id];
    }
    const previous = referenceId.value;
    referenceId.value = id;
    // Pinning B makes the old reference B: the pair swaps rather than comparing a card to itself.
    if (candidateId.value === id || candidateId.value === undefined) {
      candidateId.value = previous !== undefined && previous !== id ? previous : deckIds.value[0];
    }
    return "pinned";
  }

  function setCandidate(id: Id): CandidateOutcome {
    if (!hasId(id)) return "unknown";
    if (id === referenceId.value) return "is-reference";
    if (!inShortlist(id)) {
      if (shortlistFull.value) return "full";
      shortlist.value = [...shortlist.value, id];
      // A shortlist that had no reference gains one with its first member; B follows below.
      if (referenceId.value === undefined) {
        referenceId.value = id;
        return "unchanged";
      }
    }
    if (candidateId.value === id) return "unchanged";
    candidateId.value = id;
    return "changed";
  }

  function swapRoles(): boolean {
    const a = referenceId.value;
    const b = candidateId.value;
    if (a === undefined || b === undefined) return false;
    referenceId.value = b;
    candidateId.value = a;
    return true;
  }

  return {
    ids,
    shortlist,
    referenceId,
    candidateId,
    deckIds,
    deckState,
    compareState,
    shortlistFull,
    presentedCandidateId,
    shownCandidateId,
    inspectedId,
    decidedId,
    reason,
    view,
    overlay,
    overlayOpen,
    sheetId,
    hasId,
    inShortlist,
    addToShortlist,
    removeFromShortlist,
    toggleShortlist,
    pinReference,
    setCandidate,
    swapRoles,
    reportPresented(id) {
      presentedCandidateId.value = id;
    },
    inspect(id) {
      if (id !== undefined && !hasId(id)) return false;
      inspectedId.value = id;
      return true;
    },
    decide(id) {
      if (!hasId(id)) return false;
      decidedId.value = id;
      return true;
    },
    clearDecision() {
      decidedId.value = undefined;
    },
    setReason(text) {
      reason.value = text.slice(0, REASON_LIMIT);
      return reason.value;
    },
    setView(next) {
      view.value = next;
    },
    openSheet(id) {
      if (overlay.value !== "none" || !hasId(id)) return false;
      overlay.value = "sheet";
      overlayOpen.value = true;
      sheetId.value = id;
      return true;
    },
    requestClose() {
      if (overlay.value === "none") return;
      overlayOpen.value = false;
    },
    completeClose() {
      overlay.value = "none";
      overlayOpen.value = false;
    },
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
