import {
  createCoverflowGeometry,
  createPaginationIndicatorState,
  createStackedDeckFrame,
  isStackedDeckInspectEligible,
  resolvePaginationIndicator,
  resolveSpeedInCards,
  resolveStackedDeckFrame,
  resolveStackedDeckPile,
  resolveStackedDeckTuning,
  STACKED_DECK_ANCHOR_SKIP,
  STACKED_DECK_INTERIOR_ELASTICITY,
  StackedDeckModel,
  type ElasticityOptions,
  type ReleaseTargetPolicy,
  type SpringConfiguration,
  type PaginationIndicatorState,
  type StackedDeckFrame,
  type StackedDeckModelState,
  type StackedDeckProfile,
  type StackedDeckTuning,
} from "@snap-motion/core";
import { useElementSize } from "@vueuse/core";
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
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

import { useCarouselMotion } from "../carousel/use-carousel-motion";
import { resolveDirectionalSnapKeyboardAction } from "../internal/input/keyboard-policy";
import { useSurfaceGesture } from "../internal/input/surface-gesture";
import {
  resolveSurfaceDiagnostics,
  type SurfaceMotionDiagnostics,
} from "../internal/surface/surface-diagnostics";
import { useBoundedSpringDriver } from "../motion/bounded-spring-driver";
import type { NavigationReason } from "../motion/motion-contracts";
import type { StackedDeckPileLayer } from "./stacked-deck-contracts";

export interface UseStackedDeckMotionOptions<Id extends string> {
  readonly ids: MaybeRefOrGetter<readonly Id[]>;
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
   * Release policy. `maxAnchorSkip` is deliberately not honoured: a deck fixes its own effective
   * skip at one adjacent card, and lowering the generic policy would constrain every other surface.
   */
  readonly releasePolicy?: MaybeRefOrGetter<Partial<ReleaseTargetPolicy> | undefined>;
  readonly programmaticImpulse?: MaybeRefOrGetter<number | undefined>;
  /** Announces the durable selection. Fires only at mechanical rest, with what initiated it. */
  readonly onSettled?: (id: Id, index: number, reason: NavigationReason) => void;
  /** A tap on the current, unambiguous card: the request to open it on another surface. */
  readonly onActivate?: (id: Id, index: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deckRelease(
  policy: Partial<ReleaseTargetPolicy> | undefined,
): Partial<ReleaseTargetPolicy> {
  return { ...policy, maxAnchorSkip: STACKED_DECK_ANCHOR_SKIP };
}

/**
 * The deck's physics, resolved from whatever the consumer supplied.
 *
 * The interior envelope is the one thing a deck always states, because the one-card limit is the
 * product and a hard clamp is not how it is supposed to feel. A consumer that supplies its own
 * elasticity customizes that resistance; nothing here can weaken the one-card invariant itself,
 * which is a release policy the surface fixes elsewhere.
 */
function deckPhysics(elasticity: ElasticityOptions | undefined) {
  return {
    elasticity: elasticity ?? STACKED_DECK_INTERIOR_ELASTICITY,
    dragEnvelopeElasticity: elasticity ?? STACKED_DECK_INTERIOR_ELASTICITY,
  };
}

/**
 * The stacked deck as a Vue capability: one physical interaction exchanges exactly one adjacent
 * screen, however far it travels, and the next interaction starts on the card already on top.
 *
 * `StackedDeckModel` owns every semantic decision — the item collection, the interaction envelope,
 * visual authority, command origin, direct synchronization, and announcements. This binds that
 * model to a browser: pointer and wheel ownership, responsive tuning, reduced motion, frame
 * scheduling, hit testing, and the CSS projection of the frame and the pile.
 */
export function useStackedDeckMotion<Id extends string>(options: UseStackedDeckMotionOptions<Id>) {
  const ids = computed(() => toValue(options.ids));
  const root = options.root ?? options.viewport;
  const track = options.track ?? ref<HTMLElement>();
  const { width: measuredWidth } = useElementSize(options.viewport);
  const stageWidth = computed(() =>
    Math.max(320, measuredWidth.value || Math.min(toValue(options.stageWidth) ?? 1_120, 1_280)),
  );
  const stageHeight = computed(() => clamp(stageWidth.value * 0.56, 320, 640));
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
  const model = new StackedDeckModel<Id>({
    ids: initialIds,
    // An ID the collection does not contain is not a destination, so it cannot be a starting point
    // either. Falling back to the model's own default beats refusing to mount.
    ...(options.initialId !== undefined && initialIds.includes(options.initialId)
      ? { initialId: options.initialId }
      : {}),
  });
  const state = shallowRef<StackedDeckModelState>(model.state);

  function measure() {
    return createCoverflowGeometry({
      itemIds: ids.value,
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
  let pendingReason: NavigationReason = "route";
  const motion = useCarouselMotion<Id>({
    anchors: initialGeometry.anchors,
    bounds: initialGeometry.bounds,
    driver,
    measure,
    releasePolicy: deckRelease(toValue(options.releasePolicy)),
    resolveDragOrigin: () => ids.value[model.beginInteraction()],
    track,
    viewport: options.viewport,
    onTargetSelected(_id, reason) {
      pendingReason = reason;
    },
    ...(initialId === undefined ? {} : { initialTargetId: initialId }),
    ...(options.reducedMotionOverride === undefined
      ? {}
      : { reducedMotionOverride: options.reducedMotionOverride }),
    ...(toValue(options.spring) === undefined ? {} : { spring: toValue(options.spring)! }),
    ...deckPhysics(toValue(options.elasticity)),
    ...(toValue(options.programmaticImpulse) === undefined
      ? {}
      : { programmaticImpulse: toValue(options.programmaticImpulse)! }),
  });

  const anchorsById = computed(() => {
    const map = new Map<string, number>();
    for (const anchor of motion.snapshot.value.anchors) map.set(anchor.id, anchor.position);
    return map;
  });

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
   * Whether promoting cards to their own compositor layer is currently buying anything. Direct
   * manipulation and autonomous animation do; an idle deck does not, and a permanent hint on every
   * visible card is a permanent cost for a surface that is usually still.
   */
  const compositing = computed(() => motion.isAnimating.value || owned.value);

  watch(
    atRest,
    (rested) => {
      if (rested) model.endInteraction();
    },
    { flush: "sync" },
  );

  const statusIndex = ref<number | null>(null);

  watch(
    motion.snapshot,
    (snapshot) => {
      const currentPitch = Math.max(1, pitch.value);
      const targetIndex = snapshot.target === null ? null : model.indexOf(snapshot.target.id);
      const nearestIndex =
        snapshot.active === null ? model.state.settledIndex : model.indexOf(snapshot.active.id);
      const published = model.update({
        phase: snapshot.phase,
        physicalIndex: -snapshot.position / currentPitch,
        // An anchor the model no longer contains says nothing about the deck's selection, so it is
        // reported as no destination at all rather than as item zero.
        targetIndex: targetIndex !== null && targetIndex >= 0 ? targetIndex : null,
        nearestIndex: nearestIndex >= 0 ? nearestIndex : model.state.settledIndex,
      });
      state.value = published;
      triggerRef(state);
      if (published.announcementIndex !== null) {
        statusIndex.value = published.announcementIndex;
        const id = model.idAt(published.announcementIndex);
        if (id !== undefined) {
          options.onSettled?.(id, published.announcementIndex, pendingReason);
        }
      }
    },
    { immediate: true },
  );

  /** Continuous physical index. It projects motion but never controls the carousel mass. */
  const physicalIndex = computed(() =>
    pitch.value <= 0 ? 0 : -motion.position.value / pitch.value,
  );
  const speedInCards = computed(() => resolveSpeedInCards(motion.velocity.value, pitch.value));
  const activeTuning = computed<StackedDeckTuning>(() =>
    motion.reducedMotion.value ? reducedTuning.value : naturalTuning.value,
  );
  const currentId = computed(() => ids.value[state.value.currentIndex]);
  const settledId = computed(() => ids.value[state.value.settledIndex]);

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
    resolveStackedDeckFrame({ itemCount, traversal, tuning: activeTuning.value }, frameStorage);
    frame.value = frameStorage;
    triggerRef(frame);
  });

  /**
   * Deck thickness. One backing layer per screen still in the deck, fanned to the side its index
   * lies on. Layers are keyed by their rank within a side rather than by screen, because a layer
   * stands for "one more card that way" and never for a particular screen — so no gesture direction
   * or reversal can mirror, reorder, or re-identify one.
   */
  const pileLayers = computed<readonly StackedDeckPileLayer[]>(() => {
    let before = 0;
    let after = 0;
    return resolveStackedDeckPile({ frame: frame.value, tuning: activeTuning.value }).map(
      (pose) => {
        const side = pose.slot < 0 ? -1 : 1;
        const rank = side < 0 ? (before += 1) : (after += 1);
        return {
          key: `${side}:${rank}`,
          side,
          slot: Number(pose.slot.toFixed(3)),
          layer: pose.layer,
          opacity: pose.opacity,
          shadowStrength: pose.shadowStrength,
          transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.scale.toFixed(5)}) rotate(${pose.rotate.toFixed(3)}deg)`,
        };
      },
    );
  });

  const paginationVisualIndex = computed(() => {
    const traversal = state.value.traversal;
    return clamp(
      traversal.visualTopIndex + traversal.signedLocalDistance,
      0,
      Math.max(0, ids.value.length - 1),
    );
  });

  /**
   * The deck's pagination reports position only. A deck's velocity belongs to the card under the
   * hand, so lending it to the rail would report motion the rail is not making.
   */
  const paginationIndicator = computed(() =>
    resolvePaginationIndicator(
      paginationVisualIndex.value,
      0,
      pitch.value,
      ids.value.length,
      createPaginationIndicatorState(),
    ),
  );

  const diagnostics = computed<SurfaceMotionDiagnostics<Id>>(() =>
    resolveSurfaceDiagnostics({
      snapshot: motion.snapshot.value,
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

  /** Adopts a destination exactly: no traversal, and no announcement it did not earn. */
  function synchronizeIndex(index: number, announce = false): boolean {
    const id = model.idAt(index);
    const anchorPosition = id === undefined ? undefined : anchorsById.value.get(id);
    if (id === undefined || anchorPosition === undefined) return false;
    const current = state.value;
    const alreadySynchronized =
      motion.phase.value === "idle" &&
      motion.activeId.value === id &&
      motion.targetId.value === id &&
      Math.abs(motion.position.value - anchorPosition) <= Number.EPSILON * 16 &&
      Math.abs(motion.velocity.value) <= Number.EPSILON * 16 &&
      current.settledIndex === index &&
      current.currentIndex === index &&
      current.visualTopIndex === index;
    if (alreadySynchronized) return true;

    motion.interrupt();
    if (model.synchronize(index, { announce }) < 0) return false;
    motion.controller.remeasure({ ...measure(), activeId: id });
    state.value = model.state;
    triggerRef(state);
    return true;
  }

  function traverse(originIndex: number, targetIndex: number): boolean {
    const id = model.idAt(targetIndex);
    if (id === undefined) return false;
    model.openInteraction(originIndex);
    motion.moveTo(id);
    return true;
  }

  function requestRelative(direction: -1 | 1, reason: NavigationReason): boolean {
    if (disabled()) return false;
    const command = model.resolveRelativeCommand(direction, { owned: owned.value });
    if (command.kind !== "traverse") return false;
    pendingReason = reason;
    return traverse(command.originIndex, command.targetIndex);
  }

  function requestIndex(index: number, reason: NavigationReason = "picker"): boolean {
    if (disabled()) return false;
    const command = model.resolveAbsoluteCommand(index, {
      owned: owned.value,
      atRest: atRest.value,
    });
    if (command.kind === "none") return false;
    pendingReason = reason;
    if (command.kind === "traverse") return traverse(command.originIndex, command.targetIndex);
    return synchronizeIndex(command.targetIndex, command.announce);
  }

  /**
   * Navigates to a named destination. An ID the deck does not contain is refused outright rather
   * than clamped, so a stale route can never silently become item zero.
   */
  function requestId(id: Id, reason: NavigationReason = "picker"): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : requestIndex(index, reason);
  }

  function synchronizeId(id: Id, announce = false): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : synchronizeIndex(index, announce);
  }

  /**
   * Applies authoritative selection that did not come from this surface — a controlled prop, a
   * route change, another surface reporting where it left the user.
   *
   * This deliberately does not share the user-command admission path. `disabled` and physical
   * ownership are answers to "may this input move the surface", and controlled state is not input:
   * refusing it leaves the surface disagreeing with the application with nothing to retry it. The
   * interruption policy is explicit — while the deck is held or refusing input, the destination is
   * adopted exactly, because animating out from under a hand is worse than arriving; otherwise the
   * deck's own product policy applies, so an adjacent screen still exchanges the way it always does.
   */
  function applyControlledId(id: Id): boolean {
    const index = model.indexOf(id);
    if (index < 0) return false;
    pendingReason = "route";
    if (disabled() || owned.value) return synchronizeIndex(index, false);
    const command = model.resolveAbsoluteCommand(index, { owned: false, atRest: atRest.value });
    if (command.kind === "traverse") return traverse(command.originIndex, command.targetIndex);
    if (command.kind === "synchronize") return synchronizeIndex(command.targetIndex, false);
    return true;
  }

  function previous(reason: NavigationReason = "previous"): boolean {
    return requestRelative(-1, reason);
  }

  function next(reason: NavigationReason = "next"): boolean {
    return requestRelative(1, reason);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled()) return;
    const action = resolveDirectionalSnapKeyboardAction(event, motion.resolveDirection());
    if (!action) return;
    event.preventDefault();
    if (action === "previous") previous("keyboard");
    else if (action === "next") next("keyboard");
    else requestIndex(action === "home" ? 0 : ids.value.length - 1, "keyboard");
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
    pendingReason = "wheel";
    motion.onWheel(event);
  }

  let selectionFrame: number | undefined;

  const gesture = useSurfaceGesture({
    root,
    itemSelector: "[data-snap-motion-stacked-deck-card]",
    resolveIndex: (element) => model.indexOf((element.dataset.itemId ?? "") as Id),
    isOpenEligible: isInspectEligible,
    disabled,
    forwardPointerDown: motion.onPointerDown,
    onResolved(resolution, completed) {
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
          requestIndex(originIndex, "picker");
        });
      }
    },
  });

  /** A press is the opening of a drag, so it names the reason before the release resolves one. */
  function onPointerDown(event: PointerEvent) {
    pendingReason = "drag";
    gesture.onPointerDown(event);
  }

  function currentConfiguration() {
    const spring = toValue(options.spring);
    const programmaticImpulse = toValue(options.programmaticImpulse);
    return {
      releasePolicy: deckRelease(toValue(options.releasePolicy)),
      ...(spring === undefined ? {} : { spring }),
      ...deckPhysics(toValue(options.elasticity)),
      ...(programmaticImpulse === undefined ? {} : { programmaticImpulse }),
    };
  }

  // Physics is watched by value, not by identity. A consumer that rebuilds its configuration
  // object on every render is expressing no change at all, and reconfiguring on that would feed
  // the controller's own snapshot back into the render that produced it.
  watch(
    () => JSON.stringify(currentConfiguration()),
    () => motion.configure(currentConfiguration()),
  );

  /**
   * Item reconfiguration. The model preserves the semantic screen the deck was on and rebuilds
   * everything ordinal around it; the controller is then remeasured onto the same screen, so the
   * two never end up describing different collections.
   */
  watch(
    () => toValue(options.ids),
    (nextIds) => {
      if (nextIds.length === model.itemCount && nextIds.every((id, i) => model.idAt(i) === id)) {
        return;
      }
      motion.interrupt();
      const index = model.reconfigure(nextIds);
      const preservedId = model.idAt(index);
      state.value = model.state;
      triggerRef(state);
      motion.controller.remeasure({
        ...measure(),
        ...(preservedId === undefined ? {} : { activeId: preservedId }),
      });
    },
    { deep: true },
  );

  watch([pitch, () => toValue(options.stageWidth)], () => void nextTick(motion.remeasure));

  onBeforeUnmount(() => {
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    selectionFrame = undefined;
  });

  return {
    anchorsById,
    atRest,
    canNext: computed(() => state.value.canNext),
    canPrevious: computed(() => state.value.canPrevious),
    compositing,
    currentId,
    diagnostics,
    frame,
    isInspectEligible,
    model,
    motion,
    next,
    onClick: gesture.onClick,
    onKeyDown,
    onLostPointerCapture: gesture.onLostPointerCapture,
    onPointerDown,
    onWheel,
    owned,
    paginationIndicator,
    physicalIndex,
    pileLayers,
    pitch,
    previous,
    remeasure: motion.remeasure,
    applyControlledId,
    requestId,
    requestIndex,
    settledId,
    speedInCards,
    stageWidth,
    state,
    statusIndex: computed(() => statusIndex.value),
    synchronizeId,
    synchronizeIndex,
    tuning: activeTuning,
    tuningProfile: computed(() => naturalTuning.value.profile),
  };
}

export type UseStackedDeckMotionReturn<Id extends string> = ReturnType<
  typeof useStackedDeckMotion<Id>
>;

/**
 * The imperative surface of a mounted `StackedDeck`, as a template ref sees it: Vue unwraps the
 * exposed refs, so this is the same capability without the `.value`.
 *
 * It is deliberately a *product* handle. Navigation goes through the deck's own transaction model,
 * and observation goes through read-only telemetry — there is no controller here, because a
 * generic `moveTo` would be a way around the one-card exchange the component exists to guarantee.
 * Consumers who want that level of control compose {@link useStackedDeckMotion} instead.
 */
export interface StackedDeckHandle<Id extends string> {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** True while the surface is being manipulated or is animating on its own. */
  readonly compositing: boolean;
  /** The card the deck currently names, which leads the visual top through a handoff. */
  readonly currentId: Id | undefined;
  /** Read-only motion telemetry. Observation only: nothing here can move the deck. */
  readonly diagnostics: SurfaceMotionDiagnostics<Id>;
  readonly frame: StackedDeckFrame;
  readonly owned: boolean;
  readonly paginationIndicator: PaginationIndicatorState;
  readonly physicalIndex: number;
  readonly pitch: number;
  readonly root: HTMLElement | undefined;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: Id | undefined;
  readonly speedInCards: number;
  readonly state: StackedDeckModelState;
  readonly tuning: StackedDeckTuning;
  readonly tuningProfile: StackedDeckProfile;
  isInspectEligible(index: number): boolean;
  next(reason?: NavigationReason): boolean;
  /** Applies the surface's keyboard policy to an event a wider scope has received. */
  onKeyDown(event: KeyboardEvent): void;
  previous(reason?: NavigationReason): boolean;
  /**
   * Navigates to a destination, traversing it when adjacent and synchronizing when it is not.
   * Returns `false` for an ID the deck does not contain.
   */
  requestId(id: Id, reason?: NavigationReason): boolean;
  /** Adopts a destination exactly, with no traversal. Silent unless `announce` is true. */
  synchronizeId(id: Id, announce?: boolean): boolean;
}
