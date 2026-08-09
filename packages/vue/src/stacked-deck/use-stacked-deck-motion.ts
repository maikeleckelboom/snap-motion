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
  tightPreset,
  type ControllerConfiguration,
  type ElasticityOptions,
  type SnapAnchor,
  type SpringConfiguration,
  type PaginationIndicatorState,
  type StackedDeckFrame,
  type StackedDeckModelState,
  type StackedDeckProfile,
  type StackedDeckReleasePolicy,
  type StackedDeckTuning,
} from "@snap-motion/core";
import type { CarouselMotion } from "@snap-motion/vue/carousel";
import type { NavigationReason, SurfaceMotionDiagnostics } from "@snap-motion/vue/motion";
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
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from "vue";

import { useCarouselMotion } from "../carousel/use-carousel-motion";
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
  /** Announces the durable selection. Fires only at mechanical rest, with what initiated it. */
  readonly onSettled?: (id: Id, index: number, reason: NavigationReason) => void;
  /** A tap on the current, unambiguous card: the request to open it on another surface. */
  readonly onActivate?: (id: Id, index: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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
  readonly currentId: ComputedRef<Id | undefined>;
  /** Read-only motion telemetry. Observation only: nothing here can move the deck. */
  readonly diagnostics: ComputedRef<SurfaceMotionDiagnostics<Id>>;
  readonly frame: ShallowRef<StackedDeckFrame>;
  /** The deck's semantics, as the escape hatch for a renderer that needs to ask them directly. */
  readonly model: StackedDeckModel<Id>;
  /** The scalar controller and its input bindings, as the lower-level escape hatch. */
  readonly motion: CarouselMotion<Id>;
  /** True only while an input device physically holds the deck. */
  readonly owned: ComputedRef<boolean>;
  readonly paginationIndicator: ComputedRef<PaginationIndicatorState>;
  readonly physicalIndex: ComputedRef<number>;
  /** Full decorative physical projection for consumers composing their own renderer. */
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
  requestId(id: Id): boolean;
  /** Adopts a destination exactly, with no traversal. Silent unless `announce` is true. */
  synchronizeId(id: Id, announce?: boolean): boolean;
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
export function useStackedDeckMotion<Id extends string>(
  options: UseStackedDeckMotionOptions<Id>,
): UseStackedDeckMotionReturn<Id> {
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
  });

  const anchorsById = computed(() => {
    const map = new Map<Id, number>();
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

  /**
   * Publishes one model state and speaks for it if it asked to be announced.
   *
   * Assigning a newly created state object is already enough to invalidate a shallow ref; the
   * model builds a fresh one per publication, so nothing here needs a manual trigger.
   */
  function publish(published: StackedDeckModelState) {
    state.value = published;
    if (published.announcementIndex === null) return;
    statusIndex.value = published.announcementIndex;
    const id = model.idAt(published.announcementIndex);
    if (id !== undefined) options.onSettled?.(id, published.announcementIndex, pendingReason);
  }

  watch(
    motion.snapshot,
    (snapshot) => {
      const currentPitch = Math.max(1, pitch.value);
      const targetIndex = snapshot.target === null ? null : model.indexOf(snapshot.target.id);
      const nearestIndex =
        snapshot.active === null ? model.state.settledIndex : model.indexOf(snapshot.active.id);
      publish(
        model.update({
          phase: snapshot.phase,
          physicalIndex: -snapshot.position / currentPitch,
          // An anchor the model no longer contains says nothing about the deck's selection, so it
          // is reported as no destination at all rather than as item zero.
          targetIndex: targetIndex !== null && targetIndex >= 0 ? targetIndex : null,
          nearestIndex: nearestIndex >= 0 ? nearestIndex : model.state.settledIndex,
        }),
      );
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
  const currentId = computed(() => model.idAt(state.value.currentIndex));
  const settledId = computed(() => model.idAt(state.value.settledIndex));

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
    // Resolution writes through one reused frame, so the identity in the ref is unchanged and only
    // an explicit trigger can report it. This is the case manual triggering exists for.
    triggerRef(frame);
  });

  /**
   * Deck thickness. One decorative layer per screen still in the deck, fanned to the side its index
   * lies on. Layers retain their ordered item association for visual treatment, while keys follow
   * physical rank within a side. Identity can therefore change in place during an exchange without
   * replacing the topological node or making gesture direction an identity source.
   */
  const pileLayers = computed<readonly StackedDeckPileLayer<Id>[]>(() => {
    let before = 0;
    let after = 0;
    const layers: StackedDeckPileLayer<Id>[] = [];
    for (const pose of resolveStackedDeckPile({ frame: frame.value, tuning: activeTuning.value })) {
      const id = model.idAt(pose.itemIndex);
      if (id === undefined) continue;
      const side = pose.slot < 0 ? -1 : 1;
      const rank = side < 0 ? (before += 1) : (after += 1);
      layers.push({
        id,
        index: pose.itemIndex,
        key: `${side}:${rank}`,
        side,
        slot: Number(pose.slot.toFixed(3)),
        layer: pose.layer,
        opacity: pose.opacity,
        shadowStrength: pose.shadowStrength,
        transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.scale.toFixed(5)}) rotate(${pose.rotate.toFixed(3)}deg)`,
      });
    }
    return layers;
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

    cancelInteractionRecords();
    pendingReason = reason;
    if (model.synchronize(index, { announce }) < 0) return false;
    motion.controller.remeasure({ ...measure(), activeId: id });
    // An announced adoption already carries its announcement, so publishing the state publishes it
    // too — there is no later idle snapshot this could be waiting for.
    publish(model.state);
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

  function requestIndex(index: number, reason: NavigationReason): boolean {
    if (disabled()) return false;
    const command = model.resolveAbsoluteCommand(index, {
      owned: owned.value,
      atRest: atRest.value,
    });
    if (command.kind === "none") return false;
    if (command.kind === "traverse") {
      pendingReason = reason;
      return traverse(command.originIndex, command.targetIndex);
    }
    return synchronizeIndex(command.targetIndex, reason, command.announce);
  }

  /**
   * Navigates to a named destination. An ID the deck does not contain is refused outright rather
   * than clamped, so a stale route can never silently become item zero.
   *
   * It reports `programmatic`: this is the general imperative entry point, and an application
   * calling it is not the same event as a person tapping a card or a pagination dot.
   */
  function requestId(id: Id): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : requestIndex(index, "programmatic");
  }

  function synchronizeId(id: Id, announce = false): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : synchronizeIndex(index, "route", announce);
  }

  /** Applies authoritative selection that did not come from this surface. See `controlledId`. */
  function applyControlledId(id: Id): boolean {
    const index = model.indexOf(id);
    if (index < 0) return false;
    if (disabled() || owned.value) return synchronizeIndex(index, "route", false);
    const command = model.resolveAbsoluteCommand(index, { owned: false, atRest: atRest.value });
    if (command.kind === "traverse") {
      pendingReason = "route";
      return traverse(command.originIndex, command.targetIndex);
    }
    if (command.kind === "synchronize")
      return synchronizeIndex(command.targetIndex, "route", false);
    return true;
  }

  /**
   * Previous and Next are semantically fixed operations, not parameterised ones.
   *
   * A consumer must not be able to claim that `next()` was a drag, or that `previous()` was a
   * route: `requestActiveId` exists so an application can trust the reason it is given, and a
   * reason a caller chose is not evidence of anything. The reason-taking helper stays internal.
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
    const accepted =
      action === "previous"
        ? requestRelative(-1, "keyboard")
        : action === "next"
          ? requestRelative(1, "keyboard")
          : requestIndex(action === "home" ? 0 : model.itemCount - 1, "keyboard");
    if (accepted) event.preventDefault();
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
          // A tap on a card is a discrete choice, which is exactly what `picker` names.
          requestIndex(originIndex, "picker");
        });
      }
    },
  });

  function cancelInteractionRecords() {
    gesture.cancel();
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    selectionFrame = undefined;
    motion.interrupt();
  }

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
      if (!itemsChanged && !controlledChanged) return;

      if (itemsChanged || (controlledChanged && controlledId !== undefined)) {
        cancelInteractionRecords();
      }

      if (itemsChanged) {
        const preservedIndex = model.reconfigure(nextIds);
        const controlledIndex = controlledId === undefined ? -1 : model.indexOf(controlledId);
        const finalIndex =
          controlledIndex >= 0 ? model.synchronize(controlledIndex) : preservedIndex;
        const finalId = model.idAt(finalIndex);
        publish(model.state);
        motion.controller.remeasure({
          ...measure(),
          ...(finalId === undefined ? {} : { activeId: finalId }),
        });
        return;
      }

      // An unavailable controlled ID is remembered by this combined source. When item data later
      // makes it available, the same reconciliation path above adopts it without another ID change.
      if (controlledId !== undefined) applyControlledId(controlledId);
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
    // Forwarded as-is. A press is not yet a drag: it may be refused outright, resolve as a tap, or
    // turn out to be a vertical scroll, and only the movement the surface accepts names a reason.
    onPointerDown: gesture.onPointerDown,
    onWheel,
    owned,
    paginationIndicator,
    physicalIndex,
    pileLayers,
    pitch,
    previous,
    remeasure: motion.remeasure,
    requestId,
    settledId,
    speedInCards,
    stageWidth,
    state,
    statusIndex: computed(() => statusIndex.value),
    synchronizeId,
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
  /** Published semantics. Every ordinal on it is `-1` when the deck has no items. */
  readonly state: StackedDeckModelState;
  readonly tuning: StackedDeckTuning;
  readonly tuningProfile: StackedDeckProfile;
  isInspectEligible(index: number): boolean;
  /**
   * One adjacent card forward.
   *
   * It takes no reason, and that is the point: `requestActiveId` reports why a selection changed,
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
  requestId(id: Id): boolean;
  /** Adopts a destination exactly, with no traversal. Silent unless `announce` is true. */
  synchronizeId(id: Id, announce?: boolean): boolean;
}
