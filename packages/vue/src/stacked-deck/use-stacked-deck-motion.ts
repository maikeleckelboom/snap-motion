import {
  createCoverflowGeometry,
  createStackedDeckFrame,
  isStackedDeckInspectEligible,
  resolveSpeedInCards,
  resolveStackedDeckNeighbor,
  resolveStackedDeckFrame,
  resolveStackedDeckTuning,
  STACKED_DECK_ANCHOR_SKIP,
  STACKED_DECK_INTERIOR_ELASTICITY,
  StackedDeckModel,
  tightPreset,
  type ActiveIdRequestDetails,
  type ControllerConfiguration,
  type ElasticityOptions,
  type SnapAnchor,
  type SpringConfiguration,
  type StackedDeckDirectProjection,
  type StackedDeckExchange,
  type StackedDeckFrame,
  type StackedDeckModelState,
  type StackedDeckProfile,
  type StackedDeckReleasePolicy,
  type StackedDeckTuning,
} from "@snap-motion/core";
import type { CarouselMotion } from "@snap-motion/vue/carousel";
import type { NavigationReason, SurfaceMotionDiagnostics } from "@snap-motion/vue/motion";
import { useElementSize, useRafFn } from "@vueuse/core";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  triggerRef,
  watch,
  watchEffect,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from "vue";

import { useCarouselMotion } from "../carousel/use-carousel-motion";
import { isHTMLElement } from "../internal/dom/realm";
import { resolveDirectionalSnapKeyboardAction } from "../internal/input/keyboard-policy";
import { useSurfaceGesture } from "../internal/input/surface-gesture";
import {
  resolveSurfaceConfiguration,
  surfaceConfigurationKey,
} from "../internal/surface/surface-configuration";
import { resolveSurfaceDiagnostics } from "../internal/surface/surface-diagnostics";
import { useBoundedSpringDriver } from "../motion/bounded-spring-driver";
import type { StackedDeckPileLayer } from "./stacked-deck-contracts";

export interface UseStackedDeckMotionOptions<Id extends string> {
  readonly ids: MaybeRefOrGetter<readonly Id[]>;
  /** Physical exchange presentation. Defaults to the accepted Shuffle behavior. */
  readonly exchange?: MaybeRefOrGetter<StackedDeckExchange | undefined>;
  /** The element that owns the surface, for focus arbitration. Defaults to the viewport. */
  readonly root?: Ref<HTMLElement | undefined>;
  readonly viewport: Ref<HTMLElement | undefined>;
  readonly track?: Ref<HTMLElement | undefined>;
  readonly initialId?: Id | undefined;
  /** Fallback stage width, used before the deck has been measured. */
  readonly stageWidth?: MaybeRefOrGetter<number>;
  /** Refuses every input while true. A surface covered by an overlay is the usual reason. */
  readonly disabled?: () => boolean;
  readonly reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
  readonly spring?: MaybeRefOrGetter<SpringConfiguration | undefined>;
  /**
   * Bound and interior resistance. Omitted, the deck keeps its own product default for interior
   * overdrag, so travel past the adjacent screen resists rather than stopping dead.
   */
  readonly elasticity?: MaybeRefOrGetter<ElasticityOptions | undefined>;
  /**
   * Release policy, minus the anchor skip the deck fixes at one adjacent card. The type says so
   * rather than the implementation quietly overwriting whatever a consumer supplied.
   */
  readonly releasePolicy?: MaybeRefOrGetter<StackedDeckReleasePolicy | undefined>;
  readonly programmaticImpulse?: MaybeRefOrGetter<number | undefined>;
  /**
   * Authoritative selection from outside this surface: a controlled prop, a route, another surface
   * reporting where it left the user.
   *
   * It is applied even while the deck is `disabled` or physically held, because it is state rather
   * than input and refusing it would leave the surface disagreeing with the application with
   * nothing to retry it. The interruption policy is explicit — held or refusing input, the
   * destination is adopted exactly, since animating out from under a hand is worse than arriving;
   * otherwise the deck's own product policy applies, so an adjacent screen still exchanges the way
   * it always does. It never reports back as a user request.
   */
  readonly controlledId?: MaybeRefOrGetter<Id | undefined>;
  /** Fires when this surface accepts a semantic destination, before mechanical settlement. */
  readonly onActiveIdRequest?: (
    id: Id,
    index: number,
    reason: ActiveIdRequestDetails["reason"],
  ) => void;
  /** Announces the durable selection. Fires only at mechanical rest, with what initiated it. */
  readonly onSettled?: (id: Id, index: number, reason: NavigationReason) => void;
  /** A tap on the current, unambiguous card: the request to open it on another surface. */
  readonly onActivate?: (id: Id, index: number) => void;
}

/** Hermite ease over the unit interval, flat at both ends. Inputs here are already bounded. */
function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

const STACKED_DECK_CONFIGURATION_DEFAULTS: ControllerConfiguration = {
  spring: tightPreset.spring,
  releasePolicy: { ...tightPreset.release, maxAnchorSkip: STACKED_DECK_ANCHOR_SKIP },
  elasticity: STACKED_DECK_INTERIOR_ELASTICITY,
  dragEnvelopeElasticity: STACKED_DECK_INTERIOR_ELASTICITY,
  programmaticImpulse: tightPreset.programmaticImpulse,
};

/**
 * Everything {@link useStackedDeckMotion} publishes.
 *
 * Written out rather than inferred. A `ReturnType<typeof …>` contract versions whatever the
 * implementation currently happens to return — every internal helper, every ordinal convenience —
 * and changes silently when one of them does. This is the deliberate list, and the omissions are
 * deliberate too: index-only request and synchronization helpers, and the controlled-selection
 * plumbing, are how this capability is built rather than what it offers.
 *
 * Ordinal fields follow the model's convention: `-1` names no card, which is what an empty deck
 * reports everywhere.
 */
export interface UseStackedDeckMotionReturn<Id extends string> {
  /** Each card's anchor position, keyed by the semantic ID the consumer supplied. */
  readonly anchorsById: ComputedRef<Map<Id, number>>;
  /** Mechanical rest. It governs durable selection and announcements, never input admission. */
  readonly atRest: ComputedRef<boolean>;
  readonly canNext: ComputedRef<boolean>;
  readonly canPrevious: ComputedRef<boolean>;
  /** True while the deck is being manipulated or is animating on its own. */
  readonly compositing: ComputedRef<boolean>;
  /** The card the deck names, which leads the visual top through a handoff. */
  readonly visualId: ComputedRef<Id | undefined>;
  /** Read-only motion telemetry. Observation only: nothing here can move the deck. */
  readonly diagnostics: ComputedRef<SurfaceMotionDiagnostics<Id>>;
  readonly frame: ShallowRef<StackedDeckFrame>;
  /** The deck's semantics, as the escape hatch for a renderer that needs to ask them directly. */
  readonly model: StackedDeckModel<Id>;
  /** The scalar controller and its input bindings, as the lower-level escape hatch. */
  readonly motion: CarouselMotion<Id>;
  /** True only while an input device physically holds the deck. */
  readonly owned: ComputedRef<boolean>;
  /** Bounded interaction-local physical coordinate; rest and every new transaction rebase to 0. */
  readonly physicalIndex: ComputedRef<number>;
  /** Advanced read-only projection of the non-dominant persistent card shells. */
  readonly pileLayers: ComputedRef<readonly StackedDeckPileLayer<Id>[]>;
  readonly pitch: ComputedRef<number>;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: ComputedRef<Id | undefined>;
  readonly speedInCards: ComputedRef<number>;
  readonly stageWidth: ComputedRef<number>;
  readonly state: ShallowRef<StackedDeckModelState>;
  /** The last index announced, or `null` when the deck has not announced anything yet. */
  readonly statusIndex: ComputedRef<number | null>;
  readonly tuning: ComputedRef<StackedDeckTuning>;
  readonly tuningProfile: ComputedRef<StackedDeckProfile>;
  isInspectEligible(index: number): boolean;
  /** One adjacent card forward. It is that operation and no other, so it cannot be relabelled. */
  next(): boolean;
  onClick(event: MouseEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onLostPointerCapture(event: PointerEvent): void;
  onPointerDown(event: PointerEvent): void;
  onWheel(event: WheelEvent): void;
  /** One adjacent card back. */
  previous(): boolean;
  remeasure(): SnapAnchor<Id> | null;
  /**
   * Navigates to a destination, traversing it when adjacent and synchronizing when it is not.
   * Returns `false` for an ID the deck does not contain. Reported as `programmatic`.
   */
  navigateTo(id: Id): boolean;
  /** Adopts a destination exactly. `announce` is an advanced renderer opt-in. */
  synchronizeTo(id: Id, announce?: boolean): boolean;
}

type StackedDeckComponentMotionReturn<Id extends string> = Omit<
  UseStackedDeckMotionReturn<Id>,
  "anchorsById" | "pileLayers" | "statusIndex"
>;

interface StackedDeckPhysicalCoordinate<Id extends string> {
  readonly ids: readonly Id[];
  readonly originIndex: number;
  readonly originOrder: number;
}

/** Finite controller anchors rotated around one semantic interaction origin. */
function createStackedDeckPhysicalCoordinate<Id extends string>(
  ids: readonly Id[],
  originIndex: number,
  direction: -1 | 0 | 1 = 0,
): StackedDeckPhysicalCoordinate<Id> {
  const itemCount = ids.length;
  if (itemCount === 0) return { ids: [], originIndex: -1, originOrder: 0 };
  const safeOrigin = Math.min(Math.max(originIndex, 0), itemCount - 1);
  if (itemCount === 1) return { ids: [ids[safeOrigin]!], originIndex: safeOrigin, originOrder: 0 };
  const originOrder =
    itemCount === 2 ? (direction === -1 ? 1 : 0) : Math.floor((itemCount - 1) / 2);
  return {
    ids: Array.from({ length: itemCount }, (_unused, order) => {
      const offset = order - originOrder;
      return ids[(safeOrigin + offset + itemCount) % itemCount]!;
    }),
    originIndex: safeOrigin,
    originOrder,
  };
}

/**
 * The stacked deck as a Vue capability: one physical interaction exchanges exactly one adjacent
 * screen, however far it travels, and the next interaction starts on the card already on top.
 *
 * `StackedDeckModel` owns every semantic decision — the item collection, the interaction envelope,
 * visual authority, command origin, direct synchronization, and announcements. This binds that
 * model to a browser: pointer and wheel ownership, responsive tuning, reduced motion, frame
 * scheduling, hit testing, and the CSS projection of the persistent physical cards.
 */
export function useStackedDeckComponentMotion<Id extends string>(
  options: UseStackedDeckMotionOptions<Id>,
  onAnnouncement?: (index: number) => void,
): StackedDeckComponentMotionReturn<Id> {
  const ids = computed(() => toValue(options.ids));
  const isDirect = (): boolean => toValue(options.exchange) === "direct";
  const root = options.root ?? options.viewport;
  const track = options.track ?? ref<HTMLElement>();
  const { width: measuredWidth } = useElementSize(options.viewport);
  const stageWidth = computed(() =>
    Math.max(320, measuredWidth.value || Math.min(toValue(options.stageWidth) ?? 1_120, 1_280)),
  );
  const stageHeight = computed(() => Math.min(640, Math.max(320, stageWidth.value * 0.56)));
  const naturalTuning = computed(() =>
    resolveStackedDeckTuning({ stageWidth: stageWidth.value, stageHeight: stageHeight.value }),
  );
  const reducedTuning = computed(() =>
    resolveStackedDeckTuning({
      stageWidth: stageWidth.value,
      stageHeight: stageHeight.value,
      reducedMotion: true,
    }),
  );
  /** One pitch remains the scalar controller's direct-manipulation distance. */
  const pitch = computed(() => naturalTuning.value.motionPitch);

  const initialIds = ids.value;
  const controlledAtCreation = toValue(options.controlledId);
  const requestedInitialId =
    controlledAtCreation !== undefined && initialIds.includes(controlledAtCreation)
      ? controlledAtCreation
      : options.initialId;
  const model = new StackedDeckModel<Id>({
    ids: initialIds,
    // An ID the collection does not contain is not a destination, so it cannot be a starting point
    // either. Falling back to the model's own default beats refusing to mount.
    ...(requestedInitialId !== undefined && initialIds.includes(requestedInitialId)
      ? { initialId: requestedInitialId }
      : {}),
  });
  const state = shallowRef<StackedDeckModelState>(model.state);
  let physicalCoordinate = createStackedDeckPhysicalCoordinate(model.ids, model.state.settledIndex);

  function measure() {
    return createCoverflowGeometry({
      itemIds: physicalCoordinate.ids,
      pitch: pitch.value,
      viewportSize: Math.max(1, options.viewport.value?.clientWidth ?? stageWidth.value),
    });
  }

  const initialGeometry = measure();
  const driver = useBoundedSpringDriver(() => pitch.value);
  const initialId = model.idAt(model.state.settledIndex);
  /**
   * What initiated the movement now in flight. It is opened by whichever entry point started it and
   * read at settlement, so a surface reports what actually happened rather than assuming a drag.
   */
  let pendingReason: NavigationReason = "external";

  function acceptDestination(id: Id, reason: ActiveIdRequestDetails["reason"]): void {
    pendingReason = reason;
    const index = model.indexOf(id);
    if (index >= 0) options.onActiveIdRequest?.(id, index, reason);
  }
  function currentConfiguration() {
    const elasticity = toValue(options.elasticity);
    return resolveSurfaceConfiguration(
      {
        spring: toValue(options.spring),
        releasePolicy: toValue(options.releasePolicy),
        elasticity,
        dragEnvelopeElasticity: elasticity,
        programmaticImpulse: toValue(options.programmaticImpulse),
      },
      STACKED_DECK_CONFIGURATION_DEFAULTS,
    );
  }

  const motion = useCarouselMotion<Id>({
    anchors: initialGeometry.anchors,
    bounds: initialGeometry.bounds,
    driver,
    measure,
    ...currentConfiguration(),
    resolveDragOrigin: () => {
      // A hand opening an interaction supersedes an unfinished release rather than inheriting its
      // release frame. The anchor that hand captured on the way in is kept: it is how the shell it
      // interrupted stays continuous.
      //
      // Origin and lifecycle are bound in one statement, because a frame is rendered between any
      // two that are not. A presentation carrying a new origin with no owner is not an unowned
      // presentation but a half-built one, and the projection reads an absent lifecycle as an
      // autonomous exchange: nothing is being held, so the incoming card takes the top of the deck
      // immediately. At the frame a hand presses, the two bodies still overlap almost exactly, so
      // every shared pixel would change material for that one frame — which is the card the deck
      // names appearing to be swapped for another one. An interaction with no hand, which is a
      // wheel burst, genuinely has no held shell and keeps travelling autonomously.
      const originIndex = model.beginInteraction();
      clearDirectPresentation(true);
      directProjection.originIndex = originIndex;
      if (handOwnsDirectShell()) directProjection.phase = "held";
      rebasePhysicalCoordinate(originIndex);
      return ids.value[originIndex];
    },
    track,
    viewport: options.viewport,
    onTargetSelected(id, reason) {
      acceptDestination(id, reason);
    },
    onInteractionDirection(direction) {
      const originIndex = model.state.interactionOriginIndex;
      if (originIndex !== null) rebasePhysicalCoordinate(originIndex, direction);
    },
    ...(initialId === undefined ? {} : { initialTargetId: initialId }),
    ...(options.reducedMotionOverride === undefined
      ? {}
      : { reducedMotionOverride: options.reducedMotionOverride }),
  });

  /**
   * Rotates the controller's finite anchors while preserving the mass's physical offset from the
   * semantic interaction origin. This is the only coordinate rebase seam; model ordinals and card
   * shell identities never change with it.
   */
  function rebasePhysicalCoordinate(originIndex: number, direction: -1 | 0 | 1 = 0): void {
    const originId = model.idAt(originIndex);
    if (originId === undefined) return;
    const nextCoordinate = createStackedDeckPhysicalCoordinate(model.ids, originIndex, direction);
    const unchanged =
      physicalCoordinate.originIndex === nextCoordinate.originIndex &&
      physicalCoordinate.originOrder === nextCoordinate.originOrder &&
      physicalCoordinate.ids.every((id, index) => id === nextCoordinate.ids[index]);
    if (unchanged) return;
    physicalCoordinate = nextCoordinate;
    motion.controller.remeasure({ ...measure(), rebaseFromId: originId });
  }

  /**
   * True only while an input device physically holds the deck. This is the sole reason to refuse a
   * competing input; residual settlement deliberately is not, because a spring the user can no
   * longer see must never behave like a cooldown.
   */
  const owned = computed(
    () => motion.isDragging.value || motion.pointerOwned.value || motion.isWheeling.value,
  );
  /** Mechanical rest. It governs durable selection and announcements, never input admission. */
  const atRest = computed(() => !owned.value && motion.phase.value === "idle");
  const disabled = () => options.disabled?.() ?? false;
  /**
   * Publishes one model state and speaks for it if it asked to be announced.
   *
   * Assigning a newly created state object is already enough to invalidate a shallow ref; the
   * model builds a fresh one per publication, so nothing here needs a manual trigger.
   */
  function publish(published: StackedDeckModelState) {
    state.value = published;
    if (published.announcementIndex === null) return;
    onAnnouncement?.(published.announcementIndex);
    const id = model.idAt(published.announcementIndex);
    if (id !== undefined) options.onSettled?.(id, published.announcementIndex, pendingReason);
  }

  const directProjection: {
    -readonly [Key in keyof StackedDeckDirectProjection]: StackedDeckDirectProjection[Key];
  } = {
    direction: 0,
    originIndex: model.state.settledIndex,
    settlement: 0,
    signedTravel: 0,
    targetIndex: null,
    translateX: 0,
    translateY: 0,
  };
  let suppressSnapshotPublication = false;
  watch(
    motion.snapshot,
    (snapshot) => {
      if (suppressSnapshotPublication) return;
      const currentPitch = Math.max(1, pitch.value);
      const targetIndex = snapshot.target === null ? null : model.indexOf(snapshot.target.id);
      const nearestIndex =
        snapshot.active === null ? model.state.settledIndex : model.indexOf(snapshot.active.id);
      const published = model.update({
        phase: snapshot.phase,
        physicalPosition: -snapshot.position / currentPitch - physicalCoordinate.originOrder,
        // An anchor the model no longer contains says nothing about the deck's selection, so it
        // is reported as no destination at all rather than as item zero.
        targetIndex: targetIndex !== null && targetIndex >= 0 ? targetIndex : null,
        nearestIndex: nearestIndex >= 0 ? nearestIndex : model.state.settledIndex,
      });
      publish(published);
      if (snapshot.phase !== "idle" || owned.value) return;
      if (directProjection.phase === "parking" && published.interactionDirection !== 0) {
        directProjection.direction = published.interactionDirection;
        directProjection.signedTravel = published.interactionDirection;
        directProjection.targetIndex = resolveStackedDeckNeighbor(
          directProjection.originIndex,
          published.interactionDirection,
          model.itemCount,
        );
      } else if (directProjection.phase === "returning") {
        directProjection.direction = 0;
        directProjection.signedTravel = 0;
        directProjection.targetIndex = null;
      }
      model.endInteraction();
      suppressSnapshotPublication = true;
      try {
        rebasePhysicalCoordinate(model.state.settledIndex);
      } finally {
        suppressSnapshotPublication = false;
      }
      state.value = model.state;
    },
    { immediate: true },
  );

  /** Bounded interaction-local physical coordinate. */
  const physicalIndex = computed(() =>
    pitch.value <= 0 ? 0 : -motion.position.value / pitch.value - physicalCoordinate.originOrder,
  );
  const speedInCards = computed(() => resolveSpeedInCards(motion.velocity.value, pitch.value));
  const activeTuning = computed<StackedDeckTuning>(() =>
    motion.reducedMotion.value ? reducedTuning.value : naturalTuning.value,
  );
  const visualId = computed(() => model.idAt(state.value.currentIndex));
  const settledId = computed(() => model.idAt(state.value.settledIndex));

  const compositing = computed(() => motion.isAnimating.value || owned.value);

  /**
   * The shell the presentation owns, which outlives the model's interaction.
   *
   * A phase means a physical owner exists: a hand holding a shell, or one it has already let go of
   * and that is still travelling. The controller reaches mechanical rest — and the deck announces
   * its selection — as soon as scalar travel is finished, which can be a whole settlement before a
   * pointer-locked card hundreds of pixels away reaches the slot it is parking into. Semantics must
   * not wait for that, and the physical shell must not be cut short for them.
   */
  function presentationOriginIndex(): number | null {
    return directProjection.phase === undefined ? null : directProjection.originIndex;
  }

  /** Elapsed fraction of the release in flight, while `releaseSettlement` is running it. */
  let releaseElapsed = 0;

  /**
   * The released shell's own settlement, on its own frame budget rather than competing for the one
   * the controller settles the deck with.
   *
   * The whole path is expressed in this one bounded coordinate, so nothing here can divide by
   * remaining logical travel: a commit at a fifth of a pitch and a commit past a whole one settle
   * identically. It is a tween rather than a second mass, because both ends of the path are exact
   * frames a spring never chose, and because the eye is following one card into a pile rather than
   * watching a weight come to rest.
   */
  const releaseSettlement = useRafFn(
    ({ delta }) => {
      // 230ms is one natural period of the deck's own spring, 2π√(mass / stiffness), so the tuck
      // reads as the same material the deck is made of. It is a presentation constant rather than
      // a knob: a consumer retunes how the deck travels between screens, not how long one card
      // takes to lie down.
      releaseElapsed = Math.min(1, releaseElapsed + delta / 230);
      directProjection.settlement = smoothstep(releaseElapsed);
      triggerRef(state);
      if (releaseElapsed < 1) return;
      releaseSettlement.pause();
      // The shell now stands exactly where the resting deck draws it, so the projection can be
      // handed back — but only once the deck itself has nothing left to move.
      if (atRest.value) clearDirectPresentation();
    },
    { immediate: false },
  );

  /**
   * Ends an unfinished release. `keepAnchor` is what a hand taking the deck over needs: the anchor
   * it captured on the way in is how the still-travelling shell stays continuous.
   */
  function clearDirectPresentation(keepAnchor = false): void {
    releaseSettlement.pause();
    directProjection.settlement = 0;
    directProjection.translateX = directProjection.translateY = 0;
    directProjection.direction = 0;
    directProjection.signedTravel = 0;
    directProjection.targetIndex = null;
    delete directProjection.phase;
    if (!keepAnchor) delete directProjection.continuity;
  }

  /**
   * Whether a hand owns the Direct shell: a pointer the controller has taken, on a press this
   * surface accepted on one of its cards.
   *
   * Deliberately one fact, asked in one place. A presentation that declared itself held by a hand
   * whose movement it would then refuse would pin a shell at the frame it was pressed on for the
   * whole gesture, and one that refused to declare it would hand a shell the hand is holding to
   * the projection's autonomous depth rule.
   */
  function handOwnsDirectShell(): boolean {
    return isDirect() && motion.isDragging.value && directProjection.continuity !== undefined;
  }

  watch(
    atRest,
    (rested) => {
      if (!rested) return;
      // Semantic rest is not physical rest, and this is the seam where the two are furthest apart:
      // a commit that had no scalar travel left is at rest inside the same task the hand let go in,
      // one microtask before the gesture reports what it resolved to. A shell still held, or still
      // travelling, keeps its projection — the release records itself, and the settlement hands the
      // projection back at the frame where its pose already equals resting geometry.
      if (directProjection.phase !== "held" && !releaseSettlement.isActive.value) {
        clearDirectPresentation();
      }
    },
    { flush: "sync" },
  );

  function onDirectPointerSample(deltaX?: number, deltaY?: number): void {
    if (!isDirect()) return;
    if (deltaX === undefined || deltaY === undefined) {
      directProjection.continuity = null;
      // A press during an unfinished release anchors on the shell that release owns, which the
      // model may already have closed its interaction on.
      const continuityIndex = model.state.interactionOriginIndex ?? presentationOriginIndex();
      if (continuityIndex === null) return;
      const currentLocalPosition =
        state.value.interactionOriginIndex !== null &&
        state.value.interactionDirection !== 0 &&
        state.value.currentIndex ===
          resolveStackedDeckNeighbor(
            state.value.interactionOriginIndex,
            state.value.interactionDirection,
            model.itemCount,
          )
          ? state.value.interactionDirection
          : 0;
      directProjection.continuity = {
        progress: smoothstep(Math.min(1, Math.abs(physicalIndex.value - currentLocalPosition))),
        poses: frame.value.poses.map((pose) => ({ ...pose })),
      };
      return;
    }
    // The hand that owns this shell already opened its interaction, which is where whatever was
    // still parking stopped animating and became the anchor this sample continues from.
    if (!handOwnsDirectShell()) return;
    directProjection.phase = "held";
    directProjection.translateX = deltaX;
    directProjection.translateY = deltaY;
    triggerRef(state);
  }

  let frameStorage = createStackedDeckFrame(ids.value.length);
  const frame = shallowRef<StackedDeckFrame>(frameStorage);

  watchEffect(() => {
    // A frame is a projection of published model state, so it is sized by the model rather than by
    // the props. Those two disagree for exactly as long as it takes a new item collection to reach
    // the model, and a frame sized from the wrong one of them is a range error waiting to happen.
    const traversal = state.value.traversal;
    const itemCount = model.itemCount;
    if (frameStorage.poses.length !== itemCount) {
      frameStorage = createStackedDeckFrame(itemCount);
    }
    const originIndex =
      (isDirect() ? model.state.interactionOriginIndex : null) ?? presentationOriginIndex();
    const releaseAtMechanicalRest =
      atRest.value &&
      (directProjection.phase === "parking" || directProjection.phase === "returning");
    if (originIndex !== null && !releaseAtMechanicalRest) {
      directProjection.originIndex = originIndex;
      directProjection.direction = state.value.interactionDirection;
      directProjection.signedTravel = physicalIndex.value;
      directProjection.targetIndex =
        directProjection.direction === 0 || itemCount < 2
          ? null
          : resolveStackedDeckNeighbor(originIndex, directProjection.direction, itemCount);
    }
    resolveStackedDeckFrame(
      {
        itemCount,
        traversal,
        tuning: activeTuning.value,
        ...(originIndex === null ? {} : { direct: directProjection }),
      },
      frameStorage,
    );
    frame.value = frameStorage;
    // Resolution writes through one reused frame, so the identity in the ref is unchanged and only
    // an explicit trigger can report it. This is the case manual triggering exists for.
    triggerRef(frame);
  });

  const diagnostics = computed<SurfaceMotionDiagnostics<Id>>(() =>
    resolveSurfaceDiagnostics({
      snapshot: motion.snapshot.value,
      pointerInteractionActive: motion.pointerInteractionActive.value,
      pointerOwned: motion.pointerOwned.value,
      reducedMotion: motion.reducedMotion.value,
    }),
  );

  function isInspectEligible(index: number): boolean {
    if (disabled() || index < 0 || index >= ids.value.length) return false;
    return isStackedDeckInspectEligible(state.value, {
      index,
      // Wheel settlement is not physical ownership: nothing is being held.
      owned: motion.isDragging.value || motion.pointerOwned.value,
    });
  }

  /**
   * Adopts a destination exactly: no traversal, and no announcement it did not earn.
   *
   * The reason is stated by the caller rather than inherited. A synchronization is authoritative
   * state arriving from outside, and whatever happened to be in flight before it — a drag, a wheel
   * burst, a keypress — is not what caused it.
   */
  function synchronizeIndex(index: number, reason: NavigationReason, announce = false): boolean {
    const id = model.idAt(index);
    if (id === undefined || !motion.snapshot.value.anchors.some((anchor) => anchor.id === id))
      return false;
    const alreadySynchronized =
      atRest.value &&
      motion.nearestId.value === id &&
      motion.targetId.value === id &&
      settledId.value === id;
    if (alreadySynchronized) return true;

    cancelInteractionRecords();
    pendingReason = reason;
    if (model.synchronize(index, { announce }) < 0) return false;
    physicalCoordinate = createStackedDeckPhysicalCoordinate(model.ids, index);
    suppressSnapshotPublication = true;
    try {
      motion.controller.remeasure({ ...measure(), activeId: id });
    } finally {
      suppressSnapshotPublication = false;
    }
    // An announced adoption already carries its announcement, so publishing the state publishes it
    // too — there is no later idle snapshot this could be waiting for.
    publish(model.state);
    if (!announce) options.onSettled?.(id, index, reason);
    return true;
  }

  function traverse(originIndex: number, targetIndex: number, direction: -1 | 1): boolean {
    // A command opens its own interaction, with no hand and no anchor of its own.
    clearDirectPresentation();
    model.openInteraction(originIndex, direction);
    rebasePhysicalCoordinate(originIndex, direction);
    motion.moveTo(model.idAt(targetIndex)!);
    return true;
  }

  function requestRelative(direction: -1 | 1, reason: ActiveIdRequestDetails["reason"]): boolean {
    if (disabled()) return false;
    const command = model.resolveRelativeCommand(direction, { owned: owned.value });
    if (command.kind !== "traverse") return false;
    const id = model.idAt(command.targetIndex);
    if (id === undefined) return false;
    acceptDestination(id, reason);
    return traverse(command.originIndex, command.targetIndex, command.direction);
  }

  function requestIndex(index: number, reason: ActiveIdRequestDetails["reason"]): boolean {
    if (disabled()) return false;
    const command = model.resolveAbsoluteCommand(index, {
      owned: owned.value,
      atRest: atRest.value,
    });
    if (command.kind === "none") return false;
    const id = model.idAt(command.targetIndex);
    if (id === undefined) return false;
    acceptDestination(id, reason);
    if (command.kind === "traverse") {
      return traverse(command.originIndex, command.targetIndex, command.direction);
    }
    return synchronizeIndex(command.targetIndex, reason, command.announce);
  }

  /**
   * Navigates to a named destination. An ID the deck does not contain is refused outright rather
   * than clamped, so a stale route can never silently become item zero.
   *
   * It reports `programmatic`: this is the general imperative entry point, and an application
   * calling it is not the same event as a person tapping a card or choosing a named destination.
   */
  function navigateTo(id: Id): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : requestIndex(index, "programmatic");
  }

  function synchronizeTo(id: Id, announce = false): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : synchronizeIndex(index, "external", announce);
  }

  /** Applies authoritative selection that did not come from this surface. See `controlledId`. */
  function applyControlledId(id: Id): boolean {
    const index = model.indexOf(id);
    if (index < 0) return false;
    if (disabled() || owned.value) return synchronizeIndex(index, "external", false);
    const command = model.resolveAbsoluteCommand(index, { owned: false, atRest: atRest.value });
    if (command.kind === "traverse") {
      pendingReason = "external";
      return traverse(command.originIndex, command.targetIndex, command.direction);
    }
    if (command.kind === "synchronize")
      return synchronizeIndex(command.targetIndex, "external", false);
    return true;
  }

  /**
   * Previous and Next are semantically fixed operations, not parameterised ones. A consumer cannot
   * relabel them; the reason-taking helper stays internal so provenance remains trustworthy.
   */
  function previous(): boolean {
    return requestRelative(-1, "previous");
  }

  function next(): boolean {
    return requestRelative(1, "next");
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled()) return;
    const action = resolveDirectionalSnapKeyboardAction(event, motion.resolveDirection());
    if (!action) return;
    const surface = isHTMLElement(event.currentTarget) ? event.currentTarget : root.value;
    const focusBefore = surface?.ownerDocument.activeElement;
    const focusOwnedBySurface = surface?.contains(focusBefore ?? null) === true;
    const focusInsideViewport = options.viewport.value?.contains(focusBefore ?? null) === true;
    const accepted =
      action === "previous"
        ? requestRelative(-1, "keyboard")
        : action === "next"
          ? requestRelative(1, "keyboard")
          : requestIndex(action === "home" ? 0 : model.itemCount - 1, "keyboard");
    if (!accepted) return;
    event.preventDefault();

    // A key routed from a consumer-owned sibling control is now a deck operation. Move focus into
    // the deck synchronously, before that control can become disabled and the browser falls back to
    // <body>; this also gives a rapid follow-up Arrow key the same deterministic target.
    if (focusOwnedBySurface && !focusInsideViewport) {
      options.viewport.value?.focus({ preventScroll: true });
    }
  }

  /**
   * Wheel ownership follows the coalescing lifecycle, not raw events: the first delta of a burst
   * opens one interaction and every later delta inside it shares the same envelope, so a burst can
   * never chain into a second card. Once a burst has ended the next one begins immediately,
   * interrupting whatever is left of the previous spring.
   */
  function onWheel(event: WheelEvent) {
    if (disabled()) return;
    if (!motion.isWheeling.value && owned.value) return;
    // No reason is claimed here. A WheelEvent arriving is not a wheel navigation: it may be a
    // vertical page scroll, or belong to a descendant that owns its own scrolling. `onTargetSelected`
    // names the reason once a burst has actually resolved a destination on this surface.
    motion.onWheel(event);
  }

  let selectionFrame: number | undefined;

  const gesture = useSurfaceGesture({
    root,
    itemSelector: "[data-snap-motion-stacked-deck-card]",
    resolveIndex(element) {
      const index = model.indexOf((element.dataset.itemId ?? "") as Id);
      return frame.value.poses[index]?.interactive === true ? index : -1;
    },
    isOpenEligible: isInspectEligible,
    disabled,
    forwardPointerDown: motion.onPointerDown,
    onPointerSample: onDirectPointerSample,
    onResolved(resolution, completed) {
      if (directProjection.phase === "held") {
        if (directProjection.translateX === 0 && directProjection.translateY === 0) {
          // A shell the hand never moved has no release. Both giving a zero vector back and
          // carrying it into the pile end at the pose it is already drawn at, so the press ends
          // the presentation rather than holding the deck through a settlement with nothing in it.
          clearDirectPresentation();
        } else {
          // One immutable decision, taken from the frame the hand ended on: which shell was
          // released — the presentation's own record of it, because the model may already have
          // closed the interaction — where it was, since the raw vector is already on the
          // projection and is not touched here, and whether the deck kept the destination or gave
          // it back. The settlement opens in the same statement, so nothing can be projected
          // between the two.
          directProjection.phase =
            motion.targetId.value === model.idAt(directProjection.originIndex)
              ? "returning"
              : "parking";
          directProjection.settlement = 0;
          releaseElapsed = 0;
          releaseSettlement.resume();
        }
      }
      if (completed.cancelled) {
        // A cancelled gesture undoes itself, which means returning to the card it began on. That is
        // the interaction's own origin, not the settled selection: a gesture that took over a
        // running spring began on a card the controller had not committed to yet.
        const restoreIndex = state.value.interactionOriginIndex ?? state.value.settledIndex;
        const id = model.idAt(restoreIndex);
        if (id !== undefined) motion.moveTo(id, { initialVelocity: 0 });
        return;
      }
      if (resolution.action === "swipe") {
        const surface = root.value;
        const activeElement = surface?.ownerDocument.activeElement;
        if (
          resolution.shouldFocusStage &&
          completed.focusWasOutside &&
          surface &&
          (!activeElement || !surface.contains(activeElement))
        ) {
          options.viewport.value?.focus({ preventScroll: true });
        }
        return;
      }
      if (completed.originIndex === undefined) return;
      const originIndex = completed.originIndex;
      if (resolution.action === "open") {
        const id = model.idAt(originIndex);
        if (id !== undefined) options.onActivate?.(id, originIndex);
      } else if (resolution.action === "select") {
        if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
          selectionFrame = undefined;
          // A tap on a card is a discrete choice, which is exactly what `picker` names.
          requestIndex(originIndex, "picker");
        });
      }
    },
  });

  function cancelInteractionRecords() {
    clearDirectPresentation();
    gesture.cancel();
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    selectionFrame = undefined;
    motion.interrupt();
  }

  watch(isDirect, cancelInteractionRecords);

  // The key has an explicit fixed field order. Equivalent configuration objects therefore do not
  // reconfigure the controller, while removing any override reinstalls the complete surface default.
  watch(
    () => surfaceConfigurationKey(currentConfiguration()),
    () => motion.configure(currentConfiguration()),
  );

  /**
   * Item reconfiguration. The model preserves the semantic screen the deck was on and rebuilds
   * everything ordinal around it; the controller is then remeasured onto the same screen, so the
   * two never end up describing different collections.
   */
  watch(
    [() => toValue(options.ids), () => toValue(options.controlledId)] as const,
    ([nextIds, controlledId], priorState) => {
      const itemsChanged =
        nextIds.length !== model.itemCount || nextIds.some((id, index) => model.idAt(index) !== id);
      const controlledChanged = priorState !== undefined && controlledId !== priorState[1];
      const controlledDestinationAvailable =
        controlledId !== undefined && model.indexOf(controlledId) >= 0;
      if (!itemsChanged && !controlledChanged) return;

      // A v-model confirmation of the destination already in flight is acknowledgement, not an
      // external takeover. Let the accepted exchange finish with its original provenance.
      if (
        !itemsChanged &&
        controlledChanged &&
        controlledId !== undefined &&
        motion.targetId.value === controlledId
      ) {
        return;
      }

      if (itemsChanged || (controlledChanged && controlledDestinationAvailable)) {
        cancelInteractionRecords();
      }

      if (itemsChanged) {
        const previousSettledId = model.idAt(model.state.settledIndex);
        const preservedIndex = model.reconfigure(nextIds);
        const controlledIndex = controlledId === undefined ? -1 : model.indexOf(controlledId);
        const finalIndex =
          controlledIndex >= 0 ? model.synchronize(controlledIndex) : preservedIndex;
        const finalId = model.idAt(finalIndex);
        physicalCoordinate = createStackedDeckPhysicalCoordinate(model.ids, finalIndex);
        publish(model.state);
        motion.controller.remeasure({
          ...measure(),
          ...(finalId === undefined ? {} : { activeId: finalId }),
        });
        if (finalId !== undefined && finalId !== previousSettledId) {
          options.onSettled?.(finalId, finalIndex, controlledIndex >= 0 ? "external" : "reconcile");
        }
        return;
      }

      // An unavailable controlled ID is remembered by this combined source. When item data later
      // makes it available, the same reconciliation path above adopts it without another ID change.
      if (controlledDestinationAvailable) applyControlledId(controlledId);
    },
    { deep: true },
  );

  watch([pitch, () => toValue(options.stageWidth)], () => void nextTick(motion.remeasure));

  // Teardown is the same thing as a cancelled interaction: nothing pending may still speak for a
  // surface that no longer exists.
  onBeforeUnmount(cancelInteractionRecords);

  return {
    atRest,
    canNext: computed(() => !disabled() && state.value.canNext),
    canPrevious: computed(() => !disabled() && state.value.canPrevious),
    compositing,
    visualId,
    diagnostics,
    frame,
    isInspectEligible,
    model,
    motion,
    next,
    onClick: gesture.onClick,
    onKeyDown,
    onLostPointerCapture: gesture.onLostPointerCapture,
    // Forwarded as-is. A press is not yet a drag: it may be refused outright, resolve as a tap, or
    // turn out to be a vertical scroll, and only the movement the surface accepts names a reason.
    onPointerDown: gesture.onPointerDown,
    onWheel,
    owned,
    physicalIndex,
    pitch,
    previous,
    remeasure: motion.remeasure,
    navigateTo,
    settledId,
    speedInCards,
    stageWidth,
    state,
    synchronizeTo,
    tuning: activeTuning,
    tuningProfile: computed(() => naturalTuning.value.profile),
  };
}

/**
 * The imperative surface of a mounted `StackedDeck`, as a template ref sees it: Vue unwraps the
 * exposed refs, so this is the same capability without the `.value`.
 *
 * It is deliberately a *product* handle. Navigation goes through the deck's own transaction model,
 * and observation goes through read-only telemetry — there is no controller here, because a
 * generic `moveTo` would be a way around the one-card exchange the component exists to guarantee.
 * Consumers who want that level of control compose `useStackedDeckMotion` instead.
 */
export interface StackedDeckHandle<Id extends string> {
  /** Application semantic selection, independent of target, visual, and settled mechanics. */
  readonly activeId: Id | undefined;
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** True while the surface is being manipulated or is animating on its own. */
  readonly compositing: boolean;
  /** The card the deck currently names, which leads the visual top through a handoff. */
  readonly visualId: Id | undefined;
  /** Read-only motion telemetry. Observation only: nothing here can move the deck. */
  readonly diagnostics: SurfaceMotionDiagnostics<Id>;
  readonly frame: StackedDeckFrame;
  readonly owned: boolean;
  readonly physicalIndex: number;
  readonly pitch: number;
  readonly root: HTMLElement | undefined;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: Id | undefined;
  readonly speedInCards: number;
  /** Published semantics. Every ordinal on it is `-1` when the deck has no items. */
  readonly state: StackedDeckModelState;
  readonly tuning: StackedDeckTuning;
  readonly tuningProfile: StackedDeckProfile;
  isInspectEligible(index: number): boolean;
  /**
   * One adjacent card forward.
   *
   * It takes no reason, and that is the point: `activeIdRequest` reports why a selection was requested,
   * and an application can only trust that report if a caller cannot author it. Next is next.
   */
  next(): boolean;
  /** Applies the surface's keyboard policy to an event a wider scope has received. */
  onKeyDown(event: KeyboardEvent): void;
  /** One adjacent card back. */
  previous(): boolean;
  /**
   * Navigates to a destination, traversing it when adjacent and synchronizing when it is not.
   * Returns `false` for an ID the deck does not contain. Reported as `programmatic`.
   */
  navigateTo(id: Id): boolean;
  /** Adopts a destination exactly, with no traversal, semantic echo, or announcement. */
  synchronizeTo(id: Id): boolean;
}
