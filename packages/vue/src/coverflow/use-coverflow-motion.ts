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
  resolveSnapKeyboardAction,
  resolveSpeedInCards,
  type CoverflowTuning,
  type PaginationIndicatorState,
  type ElasticityOptions,
  type ReleaseTargetPolicy,
  type SpringConfiguration,
} from "@snap-motion/core";
import { useElementSize } from "@vueuse/core";
import { computed, nextTick, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";

import { useCarouselMotion } from "../carousel/use-carousel-motion";
import { elementOwnsSnapMotionKeyboard } from "../internal/input/keyboard-policy";
import { useSurfaceGesture } from "../internal/input/surface-gesture";
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
  /** Announces the durable selection. Fires only at mechanical rest, never on a visual change. */
  readonly onSettled?: (id: Id, index: number) => void;
  /** A tap on the settled, inspectable card: the request to open it on another surface. */
  readonly onActivate?: (id: Id, index: number) => void;
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
export function useCoverflowMotion<Id extends string>(options: UseCoverflowMotionOptions<Id>) {
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
  const initialIndex = Math.max(
    0,
    options.initialId === undefined
      ? Math.floor(ids.value.length / 2)
      : ids.value.indexOf(options.initialId),
  );
  const model = new CoverflowModel({ itemCount: ids.value.length, initialIndex });
  const statusIndex = ref<number | null>(null);
  const liveIndex = ref(initialIndex);
  const settledIndex = ref(initialIndex);
  const visualIndex = ref(initialIndex);
  const pendingTargetIndex = ref<number | null>(null);
  const commandIndex = ref(initialIndex);

  function measure() {
    return createCoverflowGeometry({
      itemIds: ids.value,
      pitch: pitch.value,
      viewportSize: Math.max(1, options.viewport.value?.clientWidth ?? stageWidth.value),
    });
  }

  const initialGeometry = measure();
  const driver = useBoundedSpringDriver(() => pitch.value);
  const motion = useCarouselMotion<Id>({
    anchors: initialGeometry.anchors,
    bounds: initialGeometry.bounds,
    driver,
    initialTargetId: ids.value[initialIndex]!,
    measure,
    track: options.track ?? ref<HTMLElement>(),
    viewport: options.viewport,
    ...(options.reducedMotionOverride === undefined
      ? {}
      : { reducedMotionOverride: options.reducedMotionOverride }),
    ...(toValue(options.spring) === undefined ? {} : { spring: toValue(options.spring)! }),
    ...(toValue(options.elasticity) === undefined
      ? {}
      : { elasticity: toValue(options.elasticity)! }),
    ...(toValue(options.releasePolicy) === undefined
      ? {}
      : { releasePolicy: toValue(options.releasePolicy)! }),
    ...(toValue(options.programmaticImpulse) === undefined
      ? {}
      : { programmaticImpulse: toValue(options.programmaticImpulse)! }),
  });

  const anchorsById = computed(() => {
    const map = new Map<string, number>();
    for (const anchor of motion.snapshot.value.anchors) map.set(anchor.id, anchor.position);
    return map;
  });

  /** True only while an input device physically holds the rail. */
  const owned = computed(
    () => motion.isDragging.value || motion.pointerOwned.value || motion.isWheeling.value,
  );
  const disabled = () => options.disabled?.() ?? false;

  watch(
    motion.snapshot,
    (snapshot) => {
      const currentPitch = Math.max(1, pitch.value);
      const targetIndex =
        snapshot.target === null ? null : Math.max(0, ids.value.indexOf(snapshot.target.id));
      const nearestIndex =
        snapshot.active === null
          ? model.state.settledIndex
          : Math.max(0, ids.value.indexOf(snapshot.active.id));
      const state = model.update({
        phase: snapshot.phase,
        physicalIndex: -snapshot.position / currentPitch,
        targetIndex,
        nearestIndex,
      });
      visualIndex.value = state.visualIndex;
      settledIndex.value = state.settledIndex;
      pendingTargetIndex.value = state.pendingTargetIndex;
      commandIndex.value = state.commandIndex;
      if (state.announcementIndex !== null) {
        liveIndex.value = state.announcementIndex;
        statusIndex.value = state.announcementIndex;
        const id = ids.value[state.announcementIndex];
        if (id !== undefined) options.onSettled?.(id, state.announcementIndex);
      }
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
  const visualId = computed(() => ids.value[visualIndex.value]);
  const settledId = computed(() => ids.value[settledIndex.value]);

  function isInspectEligible(index: number): boolean {
    const id = ids.value[index];
    if (id === undefined || disabled() || motion.isDragging.value || motion.pointerOwned.value) {
      return false;
    }
    const spring = motion.controller.configuration.spring;
    return isSettledOnAnchor({
      phase: motion.phase.value,
      index,
      settledIndex: settledIndex.value,
      physicalIndex: physicalIndex.value,
      position: motion.position.value,
      anchorPosition: anchorsById.value.get(id),
      velocity: motion.velocity.value,
      restDistance: spring.restDistance,
      restSpeed: spring.restSpeed,
      activeMatches: motion.activeId.value === id,
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

  function moveToIndex(index: number): boolean {
    const command = model.resolveNavigationCommand(index, { owned: owned.value });
    if (disabled() || command.kind !== "move") return false;
    const id = ids.value[command.targetIndex];
    if (id === undefined) return false;
    motion.moveTo(id);
    return true;
  }

  function requestId(id: Id): boolean {
    return moveToIndex(ids.value.indexOf(id));
  }

  function previous(): boolean {
    const command = model.resolveRelativeCommand(-1, { owned: owned.value });
    return command.kind === "move" && moveToIndex(command.targetIndex);
  }

  function next(): boolean {
    const command = model.resolveRelativeCommand(1, { owned: owned.value });
    return command.kind === "move" && moveToIndex(command.targetIndex);
  }

  /** Adopts a destination exactly, with no travel and no announcement it did not earn. */
  function synchronizeIndex(index: number, announce = false): boolean {
    const targetIndex = clamp(index, 0, Math.max(0, ids.value.length - 1));
    const id = ids.value[targetIndex];
    const anchorPosition = id === undefined ? undefined : anchorsById.value.get(id);
    if (id === undefined || anchorPosition === undefined) return false;
    const alreadySynchronized =
      motion.phase.value === "idle" &&
      motion.activeId.value === id &&
      motion.targetId.value === id &&
      Math.abs(motion.position.value - anchorPosition) <= Number.EPSILON * 16 &&
      Math.abs(motion.velocity.value) <= Number.EPSILON * 16 &&
      visualIndex.value === targetIndex &&
      settledIndex.value === targetIndex;
    if (alreadySynchronized) return true;

    motion.interrupt();
    model.synchronize(targetIndex, { announce });
    motion.controller.remeasure({ ...measure(), activeId: id });
    visualIndex.value = targetIndex;
    settledIndex.value = targetIndex;
    commandIndex.value = targetIndex;
    pendingTargetIndex.value = null;
    return true;
  }

  function synchronizeId(id: Id, announce = false): boolean {
    return synchronizeIndex(ids.value.indexOf(id), announce);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled()) return;
    const action = resolveSnapKeyboardAction({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      defaultPrevented: event.defaultPrevented,
      metaKey: event.metaKey,
      ownedByDescendant: elementOwnsSnapMotionKeyboard(event.target),
    });
    if (!action) return;
    event.preventDefault();
    if (action === "previous") previous();
    else if (action === "next") next();
    else moveToIndex(action === "home" ? 0 : ids.value.length - 1);
  }

  function onWheel(event: WheelEvent) {
    if (!disabled()) motion.onWheel(event);
  }

  let selectionFrame: number | undefined;

  const gesture = useSurfaceGesture({
    root,
    itemSelector: "[data-snap-motion-coverflow-card]",
    resolveIndex: (element) => ids.value.indexOf((element.dataset.itemId ?? "") as Id),
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
        const id = ids.value[originIndex];
        if (id !== undefined) options.onActivate?.(id, originIndex);
      } else if (resolution.action === "select") {
        // One frame of separation, so the release the controller is still resolving cannot be
        // overwritten by the selection it produced.
        if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
          selectionFrame = undefined;
          moveToIndex(originIndex);
        });
      }
    },
  });

  function currentConfiguration() {
    const spring = toValue(options.spring);
    const releasePolicy = toValue(options.releasePolicy);
    const elasticity = toValue(options.elasticity);
    const programmaticImpulse = toValue(options.programmaticImpulse);
    return {
      ...(spring === undefined ? {} : { spring }),
      ...(releasePolicy === undefined ? {} : { releasePolicy }),
      ...(elasticity === undefined ? {} : { elasticity }),
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

  watch([pitch, () => toValue(options.stageWidth)], () => void nextTick(motion.remeasure));

  return {
    anchorsById,
    commandIndex: computed(() => commandIndex.value),
    canNext: computed(() => commandIndex.value < ids.value.length - 1),
    canPrevious: computed(() => commandIndex.value > 0),
    isInspectEligible,
    liveIndex: computed(() => liveIndex.value),
    model,
    motion,
    next,
    onKeyDown,
    onLostPointerCapture: gesture.onLostPointerCapture,
    onPointerDown: gesture.onPointerDown,
    onWheel,
    owned,
    paginationIndicator,
    pendingTargetIndex: computed(() => pendingTargetIndex.value),
    physicalIndex,
    pitch,
    presentations,
    previous,
    remeasure: motion.remeasure,
    requestId,
    settledId,
    settledIndex: computed(() => settledIndex.value),
    speedInCards,
    stageWidth,
    statusIndex: computed(() => statusIndex.value),
    synchronizeId,
    synchronizeIndex,
    tuning,
    visualId,
    visualIndex: computed(() => visualIndex.value),
  };
}

export type UseCoverflowMotionReturn<Id extends string> = ReturnType<typeof useCoverflowMotion<Id>>;

/**
 * The imperative surface of a mounted `Coverflow`, as a template ref sees it: Vue unwraps the
 * exposed refs, so this is the same capability without the `.value`.
 */
export interface CoverflowHandle<Id extends string> {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** The destination a relative command steps from. */
  readonly commandIndex: number;
  readonly motion: UseCoverflowMotionReturn<Id>["motion"];
  readonly paginationIndicator: PaginationIndicatorState;
  readonly pendingTargetIndex: number | null;
  /** Per-card rail placement and material signals, in item order. */
  readonly presentations: readonly CoverflowCardPresentation[];
  readonly physicalIndex: number;
  readonly pitch: number;
  readonly root: HTMLElement | undefined;
  /** Durable selection. It changes only at mechanical rest. */
  readonly settledId: Id | undefined;
  readonly settledIndex: number;
  readonly speedInCards: number;
  readonly tuning: CoverflowTuning;
  /** The face in the clearing, which is what a caption and a counter should name. */
  readonly visualId: Id | undefined;
  readonly visualIndex: number;
  isInspectEligible(index: number): boolean;
  next(): boolean;
  /** Applies the surface's keyboard policy to an event a wider scope has received. */
  onKeyDown(event: KeyboardEvent): void;
  previous(): boolean;
  requestId(id: Id): boolean;
  /** Adopts a destination exactly, with no travel. Silent unless `announce` is true. */
  synchronizeId(id: Id, announce?: boolean): boolean;
}
