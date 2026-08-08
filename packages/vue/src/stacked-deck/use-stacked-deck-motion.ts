import {
  createCoverflowGeometry,
  createPaginationIndicatorState,
  createStackedDeckFrame,
  resolvePaginationIndicator,
  resolveSnapKeyboardAction,
  resolveSpeedInCards,
  resolveStackedDeckFrame,
  resolveStackedDeckPile,
  resolveStackedDeckTuning,
  STACKED_DECK_ANCHOR_SKIP,
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
import { elementOwnsSnapMotionKeyboard } from "../internal/input/keyboard-policy";
import { useSurfaceGesture } from "../internal/input/surface-gesture";
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
  readonly elasticity?: MaybeRefOrGetter<ElasticityOptions | undefined>;
  /**
   * Release policy. `maxAnchorSkip` is deliberately not honoured: a deck fixes its own effective
   * skip at one adjacent card, and lowering the generic policy would constrain every other surface.
   */
  readonly releasePolicy?: MaybeRefOrGetter<Partial<ReleaseTargetPolicy> | undefined>;
  readonly programmaticImpulse?: MaybeRefOrGetter<number | undefined>;
  /** Announces the durable selection. Fires only at mechanical rest. */
  readonly onSettled?: (id: Id, index: number) => void;
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
 * The stacked deck as a Vue capability: one physical interaction exchanges exactly one adjacent
 * screen, however far it travels, and the next interaction starts on the card already on top.
 *
 * `StackedDeckModel` owns every semantic decision — the interaction envelope, visual authority,
 * command origin, direct synchronization, and announcements. This binds that model to a browser:
 * pointer and wheel ownership, responsive tuning, reduced motion, frame scheduling, hit testing,
 * and the CSS projection of the frame and the pile.
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

  const initialIndex = Math.max(
    0,
    options.initialId === undefined
      ? Math.floor(ids.value.length / 2)
      : ids.value.indexOf(options.initialId),
  );
  const model = new StackedDeckModel({ itemCount: ids.value.length, initialIndex });
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
  const motion = useCarouselMotion<Id>({
    anchors: initialGeometry.anchors,
    bounds: initialGeometry.bounds,
    driver,
    initialTargetId: ids.value[initialIndex]!,
    measure,
    releasePolicy: deckRelease(toValue(options.releasePolicy)),
    resolveDragOrigin: () => ids.value[model.beginInteraction()],
    track,
    viewport: options.viewport,
    ...(options.reducedMotionOverride === undefined
      ? {}
      : { reducedMotionOverride: options.reducedMotionOverride }),
    ...(toValue(options.spring) === undefined ? {} : { spring: toValue(options.spring)! }),
    ...(toValue(options.elasticity) === undefined
      ? {}
      : {
          elasticity: toValue(options.elasticity)!,
          // Travel past the adjacent anchor resists instead of dying at a frozen card.
          dragEnvelopeElasticity: toValue(options.elasticity)!,
        }),
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
      const targetIndex =
        snapshot.target === null ? null : Math.max(0, ids.value.indexOf(snapshot.target.id));
      const nearestIndex =
        snapshot.active === null
          ? model.state.settledIndex
          : Math.max(0, ids.value.indexOf(snapshot.active.id));
      const published = model.update({
        phase: snapshot.phase,
        physicalIndex: -snapshot.position / currentPitch,
        targetIndex,
        nearestIndex,
      });
      state.value = published;
      triggerRef(state);
      if (published.announcementIndex !== null) {
        statusIndex.value = published.announcementIndex;
        const id = ids.value[published.announcementIndex];
        if (id !== undefined) options.onSettled?.(id, published.announcementIndex);
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

  const frameStorage = createStackedDeckFrame(ids.value.length);
  const frame = shallowRef(frameStorage);

  watchEffect(() => {
    resolveStackedDeckFrame(
      {
        itemCount: ids.value.length,
        traversal: state.value.traversal,
        tuning: activeTuning.value,
      },
      frameStorage,
    );
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

  function isInspectEligible(index: number): boolean {
    if (disabled()) return false;
    return model.isInspectEligible({
      index,
      // Wheel settlement is not physical ownership: nothing is being held.
      owned: motion.isDragging.value || motion.pointerOwned.value,
    });
  }

  /** Adopts a destination exactly: no traversal, and no announcement it did not earn. */
  function synchronizeIndex(index: number, announce = false): boolean {
    const targetIndex = clamp(index, 0, Math.max(0, ids.value.length - 1));
    const id = ids.value[targetIndex];
    const anchorPosition = id === undefined ? undefined : anchorsById.value.get(id);
    if (id === undefined || anchorPosition === undefined) return false;
    const current = state.value;
    const alreadySynchronized =
      motion.phase.value === "idle" &&
      motion.activeId.value === id &&
      motion.targetId.value === id &&
      Math.abs(motion.position.value - anchorPosition) <= Number.EPSILON * 16 &&
      Math.abs(motion.velocity.value) <= Number.EPSILON * 16 &&
      current.settledIndex === targetIndex &&
      current.currentIndex === targetIndex &&
      current.visualTopIndex === targetIndex;
    if (alreadySynchronized) return true;

    motion.interrupt();
    model.synchronize(targetIndex, { announce });
    motion.controller.remeasure({ ...measure(), activeId: id });
    state.value = model.state;
    triggerRef(state);
    return true;
  }

  function traverse(originIndex: number, targetIndex: number): boolean {
    const id = ids.value[targetIndex];
    if (id === undefined) return false;
    model.openInteraction(originIndex);
    motion.moveTo(id);
    return true;
  }

  function requestRelative(direction: -1 | 1): boolean {
    if (disabled()) return false;
    const command = model.resolveRelativeCommand(direction, { owned: owned.value });
    return command.kind === "traverse" && traverse(command.originIndex, command.targetIndex);
  }

  function requestIndex(index: number): boolean {
    if (disabled()) return false;
    const command = model.resolveAbsoluteCommand(index, {
      owned: owned.value,
      atRest: atRest.value,
    });
    if (command.kind === "traverse") return traverse(command.originIndex, command.targetIndex);
    if (command.kind === "synchronize") {
      return synchronizeIndex(command.targetIndex, command.announce);
    }
    return false;
  }

  function requestId(id: Id): boolean {
    return requestIndex(ids.value.indexOf(id));
  }

  function synchronizeId(id: Id, announce = false): boolean {
    return synchronizeIndex(ids.value.indexOf(id), announce);
  }

  function previous(): boolean {
    return requestRelative(-1);
  }

  function next(): boolean {
    return requestRelative(1);
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
    else requestIndex(action === "home" ? 0 : ids.value.length - 1);
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
    motion.onWheel(event);
  }

  let selectionFrame: number | undefined;

  const gesture = useSurfaceGesture({
    root,
    itemSelector: "[data-snap-motion-stacked-deck-card]",
    resolveIndex: (element) => ids.value.indexOf((element.dataset.itemId ?? "") as Id),
    isOpenEligible: isInspectEligible,
    disabled,
    forwardPointerDown: motion.onPointerDown,
    onResolved(resolution, completed) {
      if (completed.cancelled) {
        // A cancelled gesture undoes itself, which means returning to the card it began on. That is
        // the interaction's own origin, not the settled selection: a gesture that took over a
        // running spring began on a card the controller had not committed to yet.
        const restoreIndex = state.value.interactionOriginIndex ?? state.value.settledIndex;
        const id = ids.value[restoreIndex];
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
        const id = ids.value[originIndex];
        if (id !== undefined) options.onActivate?.(id, originIndex);
      } else if (resolution.action === "select") {
        if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
          selectionFrame = undefined;
          requestIndex(originIndex);
        });
      }
    },
  });

  watch(
    () => [
      toValue(options.spring),
      toValue(options.releasePolicy),
      toValue(options.elasticity),
      toValue(options.programmaticImpulse),
    ],
    ([spring, releasePolicy, elasticity, programmaticImpulse]) => {
      const nextElasticity = elasticity as ElasticityOptions | undefined;
      motion.configure({
        releasePolicy: deckRelease(releasePolicy as Partial<ReleaseTargetPolicy> | undefined),
        ...(spring === undefined ? {} : { spring: spring as SpringConfiguration }),
        ...(nextElasticity === undefined
          ? {}
          : { elasticity: nextElasticity, dragEnvelopeElasticity: nextElasticity }),
        ...(programmaticImpulse === undefined
          ? {}
          : { programmaticImpulse: programmaticImpulse as number }),
      });
    },
    { deep: true },
  );

  watch([pitch, () => toValue(options.stageWidth)], () => void nextTick(motion.remeasure));

  onBeforeUnmount(() => {
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
  });

  return {
    anchorsById,
    atRest,
    canNext: computed(() => state.value.canNext),
    canPrevious: computed(() => state.value.canPrevious),
    currentId,
    frame,
    isInspectEligible,
    model,
    motion,
    next,
    onKeyDown,
    onLostPointerCapture: gesture.onLostPointerCapture,
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
 */
export interface StackedDeckHandle<Id extends string> {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** The card the deck currently names, which leads the visual top through a handoff. */
  readonly currentId: Id | undefined;
  readonly frame: StackedDeckFrame;
  readonly motion: UseStackedDeckMotionReturn<Id>["motion"];
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
  next(): boolean;
  previous(): boolean;
  /** Navigates to a destination, traversing it when adjacent and synchronizing when it is not. */
  requestId(id: Id): boolean;
  /** Adopts a destination exactly, with no traversal. Silent unless `announce` is true. */
  synchronizeId(id: Id, announce?: boolean): boolean;
}
