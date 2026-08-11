import {
  CoverflowModel,
  createCoverflowGeometry,
  createCoverflowKineticState,
  createPaginationIndicatorState,
  isSettledOnAnchor,
  resolveCoverflowKinetics,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
  resolveCoverflowTuning,
  resolvePaginationIndicator,
  resolveSpeedInCards,
  type CoverflowModelState,
  type CoverflowTuning,
  type PaginationIndicatorState,
  type ElasticityOptions,
  type ActiveIdRequestDetails,
  type ReleaseTargetPolicy,
  type SnapAnchor,
  type SpringConfiguration,
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
  watch,
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
import type { CoverflowCardPresentation } from "./coverflow-contracts";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** How thick a panel is, in CSS pixels. Read as a side surface once the panel turns. */
const EDGE_THICKNESS = 1.5;
/**
 * Ceiling on the in-plane offset. `tan` runs away as a panel approaches broadside, and past this
 * point the side surface is wider than anything a screen this thin should show.
 */
const MAXIMUM_EDGE_OFFSET = 8;
/** Absolute progress past which a card can no longer be the one a pointer means. */
const INTERACTIVE_PROGRESS = 1.2;

export interface UseCoverflowMotionOptions<Id extends string> {
  readonly ids: MaybeRefOrGetter<readonly Id[]>;
  /** The element that owns the surface, for focus arbitration. Defaults to the viewport. */
  readonly root?: Ref<HTMLElement | undefined>;
  readonly viewport: Ref<HTMLElement | undefined>;
  readonly track?: Ref<HTMLElement | undefined>;
  readonly initialId?: Id | undefined;
  /** Fallback stage width used before the viewport has been measured. */
  readonly stageWidth?: MaybeRefOrGetter<number>;
  /** Refuses every input while true. A surface covered by an overlay is the usual reason. */
  readonly disabled?: () => boolean;
  readonly reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
  readonly spring?: MaybeRefOrGetter<SpringConfiguration | undefined>;
  readonly elasticity?: MaybeRefOrGetter<ElasticityOptions | undefined>;
  readonly releasePolicy?: MaybeRefOrGetter<Partial<ReleaseTargetPolicy> | undefined>;
  readonly programmaticImpulse?: MaybeRefOrGetter<number | undefined>;
  /**
   * Authoritative selection from outside this surface: a controlled prop, a route, another surface
   * reporting where it left the user.
   *
   * It is applied even while the rail is `disabled` or physically held, because it is state rather
   * than input and refusing it would leave the surface disagreeing with the application with
   * nothing to retry it. The interruption policy is explicit — held or refusing input, the
   * destination is adopted exactly, since animating out from under a hand is worse than arriving;
   * otherwise the rail travels there the way it travels anywhere. It never reports back as a user
   * request.
   */
  readonly controlledId?: MaybeRefOrGetter<Id | undefined>;
  /** Fires when this surface accepts a semantic destination, before mechanical settlement. */
  readonly onActiveIdRequest?: (
    id: Id,
    index: number,
    reason: ActiveIdRequestDetails["reason"],
  ) => void;
  /**
   * Announces the durable selection. Fires only at mechanical rest, never on a visual change, and
   * reports what initiated the change rather than assuming a drag.
   */
  readonly onSettled?: (id: Id, index: number, reason: NavigationReason) => void;
  /** A tap on the settled, inspectable card: the request to open it on another surface. */
  readonly onActivate?: (id: Id, index: number) => void;
}

/**
 * Everything {@link useCoverflowMotion} publishes.
 *
 * Written out rather than inferred, for the same reason the rail publishes one model state rather
 * than a drawer of parallel refs: a contract that is whatever the implementation returns is a
 * contract that changes without anyone deciding to change it. Index-only request and
 * synchronization helpers and the controlled-selection plumbing are how this is built, not what it
 * offers, so they are not here.
 *
 * Ordinal fields follow the model's convention: `-1` names no card, which is what an empty rail
 * reports everywhere.
 */
export interface UseCoverflowMotionReturn<Id extends string> {
  /** Each card's anchor position, keyed by the semantic ID the consumer supplied. */
  readonly anchorsById: ComputedRef<Map<Id, number>>;
  readonly canNext: ComputedRef<boolean>;
  readonly canPrevious: ComputedRef<boolean>;
  /** True while the rail is being manipulated or is animating on its own. */
  readonly compositing: ComputedRef<boolean>;
  /** Read-only motion telemetry. Observation only: nothing here can move the rail. */
  readonly diagnostics: ComputedRef<SurfaceMotionDiagnostics<Id>>;
  /** The rail's semantics, as the escape hatch for a renderer that needs to ask them directly. */
  readonly model: CoverflowModel<Id>;
  /** The scalar controller and its input bindings, as the lower-level escape hatch. */
  readonly motion: CarouselMotion<Id>;
  /** True only while an input device physically holds the rail. */
  readonly owned: ComputedRef<boolean>;
  readonly paginationIndicator: ComputedRef<PaginationIndicatorState>;
  readonly physicalIndex: ComputedRef<number>;
  readonly pitch: ComputedRef<number>;
  /** Per-card rail placement and material signals, in item order. */
  readonly presentations: ComputedRef<readonly CoverflowCardPresentation[]>;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: ComputedRef<Id | undefined>;
  readonly speedInCards: ComputedRef<number>;
  readonly stageWidth: ComputedRef<number>;
  /** The rail's whole published semantics, as one state object per publication. */
  readonly state: ShallowRef<CoverflowModelState>;
  /** The last index announced, or `null` when the rail has not announced anything yet. */
  readonly statusIndex: ComputedRef<number | null>;
  readonly tuning: ComputedRef<CoverflowTuning>;
  /** The face in the clearing, which is what a caption and a counter should name. */
  readonly visualId: ComputedRef<Id | undefined>;
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
   * Navigates to a destination. Returns `false` for an ID the rail does not contain. Reported as
   * `programmatic`.
   */
  navigateTo(id: Id): boolean;
  /** Adopts a destination exactly. `announce` is an advanced renderer opt-in. */
  synchronizeTo(id: Id, announce?: boolean): boolean;
}

/**
 * The coverflow rail as a Vue capability: geometry, physics, gestures, keyboard, selection, and
 * per-card presentation, over one scalar controller.
 *
 * Everything framework-neutral is delegated — the rail resolver, the kinetics, the bounded spring
 * mathematics, and `CoverflowModel`'s selection and command policy. What remains here is the part
 * that genuinely needs a browser: element measurement, pointer and wheel binding, hit testing,
 * reduced-motion preference, frame scheduling, and CSS projection.
 */
export function useCoverflowMotion<Id extends string>(
  options: UseCoverflowMotionOptions<Id>,
): UseCoverflowMotionReturn<Id> {
  const ids = computed(() => toValue(options.ids));
  const root = options.root ?? options.viewport;
  const { width: measuredWidth } = useElementSize(options.viewport);
  const stageWidth = computed(() =>
    Math.max(320, measuredWidth.value || Math.min(toValue(options.stageWidth) ?? 1_120, 1_280)),
  );
  const tuning = computed<CoverflowTuning>(() =>
    resolveCoverflowTuning({ stageWidth: stageWidth.value }),
  );
  const pitch = computed(() => tuning.value.pitch);
  const initialIds = ids.value;
  const controlledAtCreation = toValue(options.controlledId);
  const requestedInitialId =
    controlledAtCreation !== undefined && initialIds.includes(controlledAtCreation)
      ? controlledAtCreation
      : options.initialId;
  const model = new CoverflowModel<Id>({
    ids: initialIds,
    // An ID the collection does not contain is not a destination, so it cannot be a starting point
    // either. Falling back to the model's own default beats refusing to mount.
    ...(requestedInitialId !== undefined && initialIds.includes(requestedInitialId)
      ? { initialId: requestedInitialId }
      : {}),
  });
  const initialIndex = model.state.settledIndex;
  const statusIndex = ref<number | null>(null);
  /**
   * The rail's semantics, as one object per publication.
   *
   * There is exactly one of these on purpose. A drawer of parallel refs is a set of facts that can
   * disagree — every write site has to remember all of them, and the one that forgets produces a
   * rail whose visual index, durable selection, and command origin describe three different
   * moments. The model already resolves all of it together; this is where that resolution lands.
   */
  const state = shallowRef<CoverflowModelState>(model.state);
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

  function measure() {
    return createCoverflowGeometry({
      itemIds: ids.value,
      pitch: pitch.value,
      viewportSize: Math.max(1, options.viewport.value?.clientWidth ?? stageWidth.value),
    });
  }

  const initialGeometry = measure();
  const driver = useBoundedSpringDriver(() => pitch.value);
  function currentConfiguration() {
    return resolveSurfaceConfiguration({
      spring: toValue(options.spring),
      releasePolicy: toValue(options.releasePolicy),
      elasticity: toValue(options.elasticity),
      programmaticImpulse: toValue(options.programmaticImpulse),
    });
  }

  const motion = useCarouselMotion<Id>({
    anchors: initialGeometry.anchors,
    bounds: initialGeometry.bounds,
    driver,
    ...currentConfiguration(),
    measure,
    track: options.track ?? ref<HTMLElement>(),
    viewport: options.viewport,
    onTargetSelected(id, reason) {
      acceptDestination(id, reason);
    },
    ...(model.idAt(initialIndex) === undefined
      ? {}
      : { initialTargetId: model.idAt(initialIndex)! }),
    ...(options.reducedMotionOverride === undefined
      ? {}
      : { reducedMotionOverride: options.reducedMotionOverride }),
  });

  const anchorsById = computed(() => {
    const map = new Map<Id, number>();
    for (const anchor of motion.snapshot.value.anchors) map.set(anchor.id, anchor.position);
    return map;
  });

  /** True only while an input device physically holds the rail. */
  const owned = computed(
    () => motion.isDragging.value || motion.pointerOwned.value || motion.isWheeling.value,
  );
  const disabled = () => options.disabled?.() ?? false;
  /**
   * Whether promoting cards to their own compositor layer is currently buying anything. Direct
   * manipulation and autonomous animation do; an idle rail does not, and a permanent hint on every
   * visible card is a permanent cost for a surface that is usually still.
   */
  const compositing = computed(() => motion.isAnimating.value || owned.value);

  /**
   * Publishes one model state and speaks for it if it asked to be announced.
   *
   * Assigning a newly created state object is already enough to invalidate a shallow ref; the model
   * builds a fresh one per publication, so nothing here needs a manual trigger.
   */
  function publish(published: CoverflowModelState) {
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
          // An anchor the model no longer contains says nothing about the rail's selection, so it
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
    clamp(
      pitch.value <= 0 ? 0 : -motion.position.value / pitch.value,
      0,
      Math.max(0, ids.value.length - 1),
    ),
  );
  const speedInCards = computed(() => resolveSpeedInCards(motion.velocity.value, pitch.value));
  const visualId = computed(() => model.idAt(state.value.visualIndex));
  const settledId = computed(() => model.idAt(state.value.settledIndex));

  function isInspectEligible(index: number): boolean {
    const id = ids.value[index];
    if (id === undefined || disabled() || motion.isDragging.value || motion.pointerOwned.value) {
      return false;
    }
    const spring = motion.controller.configuration.spring;
    return isSettledOnAnchor({
      phase: motion.phase.value,
      index,
      settledIndex: state.value.settledIndex,
      physicalIndex: physicalIndex.value,
      position: motion.position.value,
      anchorPosition: anchorsById.value.get(id),
      velocity: motion.velocity.value,
      restDistance: spring.restDistance,
      restSpeed: spring.restSpeed,
      activeMatches: motion.nearestId.value === id,
      targetMatches: motion.targetId.value === id,
    });
  }

  const kineticState = createCoverflowKineticState();

  const presentations = computed<readonly CoverflowCardPresentation[]>(() => {
    const reduced = motion.reducedMotion.value;
    const position = motion.position.value;
    const velocity = motion.velocity.value;
    const currentPitch = pitch.value;
    const current = tuning.value;

    return ids.value.map((id) => {
      const anchorPosition = anchorsById.value.get(id) ?? 0;
      const progress = resolveCoverflowProgress({
        anchorPosition,
        pitch: currentPitch,
        position,
      });
      const presentation = resolveCoverflowPresentation({
        progress,
        reducedMotion: reduced,
        sidePeakX: current.sidePeakX,
        perspective: current.perspective,
        maxRotateY: current.maxRotateY,
        // Parked cards are a stack of parallel panels, so they share one angle and one spacing.
        stackGapRotateY: 0,
        stackGap: current.stackGap,
        sideDepth: current.sideDepth,
        sideScale: 1,
        stackGapScale: 0,
        sideOpacity: 1,
        hideAfter: current.hideAfter,
      });

      resolveCoverflowKinetics(progress, velocity, currentPitch, kineticState);
      const rotateY = presentation.rotateY + kineticState.retainedYaw;
      const yaw = current.maxRotateY === 0 ? 0 : rotateY / current.maxRotateY;
      const edgeStrength = Math.abs(Math.sin((rotateY * Math.PI) / 180));
      const edgeSide: -1 | 0 | 1 = rotateY < 0 ? 1 : rotateY > 0 ? -1 : 0;
      const sheen = clamp(Math.abs(yaw), 0, 1);

      return {
        progress,
        rotateY,
        scale: presentation.scale - kineticState.scaleLoss,
        translateX: presentation.translateX,
        translateZ: presentation.translateZ - kineticState.recess,
        zIndex: presentation.zIndex,
        visible: presentation.visible,
        interactive: presentation.visible && Math.abs(progress) < INTERACTIVE_PROGRESS,
        depth: clamp(presentation.depth, 0, 1),
        deepRail: clamp((presentation.depth - 1) / 2.05, 0, 1),
        yaw,
        edgeStrength,
        edgeSide,
        // Signed so the side surface lands on whichever edge the yaw has turned toward the camera.
        edgeOffset: clamp(
          -Math.tan((rotateY * Math.PI) / 180) * EDGE_THICKNESS,
          -MAXIMUM_EDGE_OFFSET,
          MAXIMUM_EDGE_OFFSET,
        ),
        sheen,
        centerInfluence: kineticState.centerInfluence,
        kineticFocus: kineticState.kineticFocus,
        settledness: kineticState.settledness,
        contactShadow: kineticState.contactShadowStrength,
        // Darken the edge that the neighbouring panel passes in front of.
        occlusion:
          clamp(1 - Math.abs(progress), 0, 1) *
          (0.32 + 0.68 * sheen) *
          (1 - kineticState.kineticFocus * 0.25),
      };
    });
  });

  const paginationIndicator = computed(() =>
    resolvePaginationIndicator(
      physicalIndex.value,
      motion.velocity.value,
      pitch.value,
      ids.value.length,
      createPaginationIndicatorState(),
    ),
  );

  function moveToIndex(index: number, reason: ActiveIdRequestDetails["reason"]): boolean {
    const command = model.resolveNavigationCommand(index, { owned: owned.value });
    if (disabled() || command.kind !== "move") return false;
    const id = model.idAt(command.targetIndex);
    if (id === undefined) return false;
    acceptDestination(id, reason);
    motion.moveTo(id);
    return true;
  }

  function moveRelative(direction: -1 | 1, reason: ActiveIdRequestDetails["reason"]): boolean {
    const command = model.resolveRelativeCommand(direction, { owned: owned.value });
    return command.kind === "move" && moveToIndex(command.targetIndex, reason);
  }

  /**
   * Navigates to a named destination. An ID the rail does not contain is refused outright rather
   * than clamped, so a stale route can never silently become item zero.
   *
   * It reports `programmatic`: this is the general imperative entry point, and an application
   * calling it is not the same event as a person tapping a card or a pagination dot.
   */
  function navigateTo(id: Id): boolean {
    const index = model.indexOf(id);
    return index < 0 ? false : moveToIndex(index, "programmatic");
  }

  /**
   * Previous and Next are semantically fixed operations, not parameterised ones. A consumer cannot
   * relabel them; the reason-taking helper stays internal so provenance remains trustworthy.
   */
  function previous(): boolean {
    return moveRelative(-1, "previous");
  }

  function next(): boolean {
    return moveRelative(1, "next");
  }

  /**
   * Adopts a destination exactly, with no travel and no announcement it did not earn.
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
      motion.nearestId.value === id &&
      motion.targetId.value === id &&
      Math.abs(motion.position.value - anchorPosition) <= Number.EPSILON * 16 &&
      Math.abs(motion.velocity.value) <= Number.EPSILON * 16 &&
      current.visualIndex === index &&
      current.settledIndex === index;
    if (alreadySynchronized) return true;

    cancelInteractionRecords();
    pendingReason = reason;
    if (model.synchronize(index, { announce }) < 0) return false;
    motion.controller.remeasure({ ...measure(), activeId: id });
    // An announced adoption already carries its announcement, so publishing the state publishes it
    // too — there is no later idle snapshot this could be waiting for.
    publish(model.state);
    if (!announce) options.onSettled?.(id, index, reason);
    return true;
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
    const command = model.resolveNavigationCommand(index, { owned: false });
    if (command.kind !== "move") return true;
    const targetId = model.idAt(command.targetIndex);
    if (targetId === undefined) return false;
    pendingReason = "external";
    motion.moveTo(targetId);
    return true;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled()) return;
    const action = resolveDirectionalSnapKeyboardAction(event, motion.resolveDirection());
    if (!action) return;
    const accepted =
      action === "previous"
        ? moveRelative(-1, "keyboard")
        : action === "next"
          ? moveRelative(1, "keyboard")
          : moveToIndex(action === "home" ? 0 : model.itemCount - 1, "keyboard");
    if (accepted) event.preventDefault();
  }

  function onWheel(event: WheelEvent) {
    if (disabled()) return;
    // No reason is claimed here. A WheelEvent arriving is not a wheel navigation: it may be a
    // vertical page scroll, or belong to a descendant that owns its own scrolling. `onTargetSelected`
    // names the reason once a burst has actually resolved a destination on this surface.
    motion.onWheel(event);
  }

  let selectionFrame: number | undefined;

  const gesture = useSurfaceGesture({
    root,
    itemSelector: "[data-snap-motion-coverflow-card]",
    resolveIndex(element) {
      const index = model.indexOf((element.dataset.itemId ?? "") as Id);
      return presentations.value[index]?.interactive === true ? index : -1;
    },
    isOpenEligible: isInspectEligible,
    disabled,
    forwardPointerDown: motion.onPointerDown,
    onResolved(resolution, completed) {
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
        // One frame of separation, so the release the controller is still resolving cannot be
        // overwritten by the selection it produced.
        if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
          selectionFrame = undefined;
          // A tap on a card is a discrete choice, which is exactly what `picker` names.
          moveToIndex(originIndex, "picker");
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
   * Item reconfiguration. The model preserves the semantic card the rail was on and rebuilds
   * everything ordinal around it; the controller is then remeasured onto the same card, so the two
   * never end up describing different collections.
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

      // A controlled host normally confirms the destination this surface just emitted. The
      // controller is already travelling there, so treating that confirmation as an external
      // takeover would interrupt the gesture, erase its provenance, and snap the rail to rest.
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

      if (controlledDestinationAvailable) applyControlledId(controlledId);
    },
    { deep: true },
  );

  watch([pitch, () => toValue(options.stageWidth)], () => void nextTick(motion.remeasure));

  const diagnostics = computed<SurfaceMotionDiagnostics<Id>>(() =>
    resolveSurfaceDiagnostics({
      snapshot: motion.snapshot.value,
      pointerInteractionActive: motion.pointerInteractionActive.value,
      pointerOwned: motion.pointerOwned.value,
      reducedMotion: motion.reducedMotion.value,
    }),
  );

  onBeforeUnmount(() => {
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    selectionFrame = undefined;
  });

  return {
    anchorsById,
    canNext: computed(() => state.value.canNext),
    canPrevious: computed(() => state.value.canPrevious),
    compositing,
    diagnostics,
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
    pitch,
    presentations,
    previous,
    remeasure: motion.remeasure,
    navigateTo,
    settledId,
    speedInCards,
    stageWidth,
    state,
    statusIndex: computed(() => statusIndex.value),
    synchronizeTo,
    tuning,
    visualId,
  };
}

/**
 * The imperative surface of a mounted `Coverflow`, as a template ref sees it: Vue unwraps the
 * exposed refs, so this is the same capability without the `.value`.
 *
 * It is deliberately a *product* handle. Navigation goes through the rail's own command policy and
 * observation goes through read-only telemetry; the controller is not part of it, so a consumer
 * cannot move the surface in a way the model has not agreed to. Composing
 * `useCoverflowMotion` directly remains the way to build a renderer that needs more.
 */
export interface CoverflowHandle<Id extends string> {
  /** Application semantic selection, independent of target, visual, and settled mechanics. */
  readonly activeId: Id | undefined;
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** True while the surface is being manipulated or is animating on its own. */
  readonly compositing: boolean;
  /** Read-only motion telemetry. Observation only: nothing here can move the rail. */
  readonly diagnostics: SurfaceMotionDiagnostics<Id>;
  readonly paginationIndicator: PaginationIndicatorState;
  /** Per-card rail placement and material signals, in item order. */
  readonly presentations: readonly CoverflowCardPresentation[];
  readonly physicalIndex: number;
  readonly pitch: number;
  readonly root: HTMLElement | undefined;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: Id | undefined;
  readonly speedInCards: number;
  /** Published semantics. Every ordinal on it is `-1` when the rail has no items. */
  readonly state: CoverflowModelState;
  readonly tuning: CoverflowTuning;
  /** The face in the clearing, which is what a caption and a counter should name. */
  readonly visualId: Id | undefined;
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
   * Navigates to a destination. Returns `false` for an ID the rail does not contain. Reported as
   * `programmatic`.
   */
  navigateTo(id: Id): boolean;
  /** Adopts a destination exactly, with no travel, semantic echo, or announcement. */
  synchronizeTo(id: Id): boolean;
}
