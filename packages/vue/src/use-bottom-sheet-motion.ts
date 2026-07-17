import type {
  AnimationDriver,
  ControllerConfigurationUpdate,
  ControllerSnapshot,
  ElasticityOptions,
  ReleaseTargetPolicy,
  SnapAnchor,
  SpringConfiguration,
} from "@snap-motion/core";
import {
  computed,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type CSSProperties,
  type Ref,
} from "vue";

import {
  createViewportBottomSheetSnapPoints,
  defaultBottomSheetReleasePolicy,
  defaultBottomSheetViewportPolicy,
  resolveBottomSheetSnapPoints,
  type BottomSheetMeasureContext,
  type BottomSheetOpenSnapId,
  type BottomSheetSnapPoint,
  type BottomSheetViewportPolicy,
  type ResolvedBottomSheetSnapPoint,
} from "./bottom-sheet-policy.js";
import type { PointerIntent } from "./input-policy.js";
import { useRemeasurement } from "./remeasurement.js";
import { useSnapMotion } from "./use-snap-motion.js";

const HIDDEN_SNAP_ID = "__snap_motion_hidden__" as const;
type InternalBottomSheetSnapId<Id extends string> = Id | typeof HIDDEN_SNAP_ID;

export type BottomSheetState = "closed" | "closing" | "dragging" | "open" | "opening" | "settling";

export interface UseBottomSheetMotionOptions<Id extends string = BottomSheetOpenSnapId> {
  defaultOpenSnapId?: Id;
  driver?: AnimationDriver;
  elasticity?: ElasticityOptions;
  getMeasureContext?: () => Partial<BottomSheetMeasureContext>;
  getViewportHeight?: () => number;
  initialSnapId?: Id | "hidden";
  initialViewportHeight?: number;
  maximumScrimOpacity?: number;
  onHidden?: () => void;
  onSnap?: (id: Id) => void;
  onTargetSelected?: (id: Id) => void;
  panel: Ref<HTMLElement | undefined>;
  programmaticImpulse?: number;
  reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
  releasePolicy?: Partial<ReleaseTargetPolicy>;
  snapPoints?: readonly BottomSheetSnapPoint<Id>[];
  spring?: SpringConfiguration;
  viewportPolicy?: Partial<BottomSheetViewportPolicy>;
}

export interface UseBottomSheetMotionReturn<Id extends string = BottomSheetOpenSnapId> {
  readonly activeId: ComputedRef<Id | undefined>;
  readonly activeSnapId: ComputedRef<Id | undefined>;
  readonly close: () => void;
  readonly configure: (update: ControllerConfigurationUpdate) => void;
  readonly interrupt: () => void;
  readonly isAnimating: ComputedRef<boolean>;
  readonly isDragging: Ref<boolean>;
  readonly onNativeDragStart: (event: DragEvent) => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly open: (id?: Id) => SnapAnchor<Id> | null;
  readonly panelStyle: ComputedRef<CSSProperties>;
  readonly phase: ComputedRef<ControllerSnapshot<Id>["phase"]>;
  readonly pointerIntent: Ref<PointerIntent>;
  readonly pointerOwned: Ref<boolean>;
  readonly position: ComputedRef<number>;
  readonly reducedMotion: ComputedRef<boolean>;
  readonly remeasure: () => SnapAnchor<Id> | null;
  readonly resolvedSnapPoints: ComputedRef<readonly ResolvedBottomSheetSnapPoint<Id>[]>;
  readonly scrimOpacity: ComputedRef<number>;
  readonly sheetState: Ref<BottomSheetState>;
  readonly snapTo: (id: Id) => SnapAnchor<Id> | null;
  readonly snapToNearest: () => SnapAnchor<Id> | null;
  readonly snapshot: ComputedRef<ControllerSnapshot<Id>>;
  readonly surfaceStyle: { readonly touchAction: string };
  readonly targetId: ComputedRef<Id | undefined>;
  readonly transform: ComputedRef<string>;
  readonly velocity: ComputedRef<number>;
  readonly viewportHeight: Ref<number>;
}

function browserMeasureContext(
  fallbackHeight: number,
  panel: HTMLElement | undefined,
  overrides: Partial<BottomSheetMeasureContext> = {},
): BottomSheetMeasureContext {
  const browser = typeof window === "undefined" ? undefined : window;
  const viewportHeight = overrides.viewportHeight ?? browser?.innerHeight ?? fallbackHeight;
  const visualViewportHeight =
    overrides.visualViewportHeight ?? browser?.visualViewport?.height ?? viewportHeight;
  return {
    viewportWidth: overrides.viewportWidth ?? browser?.innerWidth ?? 0,
    viewportHeight,
    visualViewportHeight,
    panelIntrinsicSize: overrides.panelIntrinsicSize ?? panel?.scrollHeight ?? 0,
    safeAreaTop: overrides.safeAreaTop ?? 0,
    safeAreaBottom: overrides.safeAreaBottom ?? 0,
    topGap: overrides.topGap ?? defaultBottomSheetViewportPolicy.topGap,
    closedOffset: overrides.closedOffset ?? defaultBottomSheetViewportPolicy.hiddenOvershoot,
  };
}

function internalAnchorById<Id extends string>(
  anchors: readonly SnapAnchor<InternalBottomSheetSnapId<Id>>[],
  id: InternalBottomSheetSnapId<Id>,
) {
  return anchors.find((candidate) => candidate.id === id);
}

export function useBottomSheetMotion<Id extends string = BottomSheetOpenSnapId>(
  options: UseBottomSheetMotionOptions<Id>,
): UseBottomSheetMotionReturn<Id> {
  const fallbackPoints = createViewportBottomSheetSnapPoints(
    options.viewportPolicy,
  ) as readonly BottomSheetSnapPoint<Id>[];
  const points = options.snapPoints ?? fallbackPoints;
  if (points.length === 0) throw new RangeError("Bottom sheets require at least one snap point.");
  if (points.some((point) => point.id === HIDDEN_SNAP_ID)) {
    throw new RangeError(`${HIDDEN_SNAP_ID} is reserved for internal closing state.`);
  }

  const defaultOpenSnapId = options.defaultOpenSnapId ?? points[Math.min(1, points.length - 1)]!.id;
  const initialSnapId = options.initialSnapId ?? "hidden";
  const initialViewportHeight = options.initialViewportHeight ?? 800;
  const maximumScrimOpacity = options.maximumScrimOpacity ?? 0.56;
  const viewportHeight = ref(initialViewportHeight);
  const resolvedSnapPoints = shallowRef<readonly ResolvedBottomSheetSnapPoint<Id>[]>([]);

  function readContext() {
    const explicitViewportHeight = options.getViewportHeight?.();
    const overrides = options.getMeasureContext?.() ?? {};
    const context = browserMeasureContext(initialViewportHeight, options.panel.value, {
      ...overrides,
      ...(explicitViewportHeight === undefined
        ? {}
        : {
            viewportHeight: explicitViewportHeight,
            visualViewportHeight: explicitViewportHeight,
          }),
      ...(options.viewportPolicy?.topGap === undefined
        ? {}
        : { topGap: options.viewportPolicy.topGap }),
      ...(options.viewportPolicy?.hiddenOvershoot === undefined
        ? {}
        : { closedOffset: options.viewportPolicy.hiddenOvershoot }),
    });
    viewportHeight.value = context.visualViewportHeight;
    return context;
  }

  function createAnchors(context: BottomSheetMeasureContext) {
    const resolved = resolveBottomSheetSnapPoints(points, context);
    resolvedSnapPoints.value = resolved;
    const enabled = resolved.filter((point) => !point.disabled);
    if (enabled.length === 0) throw new RangeError("Bottom sheets require one enabled snap point.");
    const openAnchors: SnapAnchor<InternalBottomSheetSnapId<Id>>[] = enabled.map((point) => ({
      id: point.id,
      order: point.order,
      position: point.position,
    }));
    const lastOrder = Math.max(...resolved.map((point) => point.order));
    const hiddenPosition = context.visualViewportHeight + context.closedOffset;
    return [...openAnchors, { id: HIDDEN_SNAP_ID, order: lastOrder + 1, position: hiddenPosition }];
  }

  const initialContext = browserMeasureContext(initialViewportHeight, undefined, {
    viewportHeight: initialViewportHeight,
    visualViewportHeight: initialViewportHeight,
    ...(options.viewportPolicy?.topGap === undefined
      ? {}
      : { topGap: options.viewportPolicy.topGap }),
    ...(options.viewportPolicy?.hiddenOvershoot === undefined
      ? {}
      : { closedOffset: options.viewportPolicy.hiddenOvershoot }),
  });
  const initialAnchors = createAnchors(initialContext);
  const internalInitialId =
    initialSnapId === "hidden" ? HIDDEN_SNAP_ID : (initialSnapId as InternalBottomSheetSnapId<Id>);
  const initialTarget = internalAnchorById(initialAnchors, internalInitialId) ?? initialAnchors[0]!;
  const sheetState = ref<BottomSheetState>(initialSnapId === "hidden" ? "closed" : "open");

  function resolveReleaseTarget(
    snapshot: ControllerSnapshot<InternalBottomSheetSnapId<Id>>,
    velocity: number,
  ) {
    const release = {
      closeVelocity:
        options.releasePolicy?.flingVelocity ?? defaultBottomSheetReleasePolicy.closeVelocity,
      expandVelocity:
        options.releasePolicy?.flingVelocity ?? defaultBottomSheetReleasePolicy.expandVelocity,
      projectionSeconds:
        options.releasePolicy?.projectionSeconds ??
        defaultBottomSheetReleasePolicy.projectionSeconds,
    };
    const openAnchors = snapshot.anchors.filter((anchor) => anchor.id !== HIDDEN_SNAP_ID);
    openAnchors.sort((a, b) => a.position - b.position || a.order - b.order);
    const hidden = internalAnchorById(snapshot.anchors, HIDDEN_SNAP_ID)!;
    if (velocity >= release.closeVelocity) return hidden.id;
    if (velocity <= -release.expandVelocity) return openAnchors[0]?.id;
    const projected = snapshot.position + velocity * release.projectionSeconds;
    const last = openAnchors.at(-1);
    if (last && projected >= last.position + (hidden.position - last.position) / 2) {
      return hidden.id;
    }
    return openAnchors.reduce(
      (nearest, candidate) =>
        !nearest ||
        Math.abs(candidate.position - projected) < Math.abs(nearest.position - projected)
          ? candidate
          : nearest,
      undefined as SnapAnchor<InternalBottomSheetSnapId<Id>> | undefined,
    )?.id;
  }

  const motion = useSnapMotion<InternalBottomSheetSnapId<Id>>({
    ...options,
    anchors: initialAnchors,
    axis: "y",
    bounds: {
      min: Math.min(...initialAnchors.map((anchor) => anchor.position)),
      max: Math.max(...initialAnchors.map((anchor) => anchor.position)),
    },
    initialPosition: initialTarget.position,
    initialTargetId: initialTarget.id,
    elasticity: options.elasticity ?? {
      min: { resistance: 2.4, maxDistance: 56 },
      max: false,
    },
    onChange(snapshot) {
      if (snapshot.phase === "dragging") sheetState.value = "dragging";
      else if (
        snapshot.phase === "settling" &&
        sheetState.value !== "opening" &&
        sheetState.value !== "closing"
      ) {
        sheetState.value = "settling";
      }
    },
    onComplete(target) {
      if (target.id === HIDDEN_SNAP_ID) {
        sheetState.value = "closed";
        options.onHidden?.();
      } else {
        sheetState.value = "open";
        options.onSnap?.(target.id);
      }
    },
    onReleaseTargetSelected(id) {
      if (id !== undefined && id !== HIDDEN_SNAP_ID) options.onTargetSelected?.(id);
    },
    pointerIntent: "immediate",
    releasePolicy: {
      projectionSeconds: defaultBottomSheetReleasePolicy.projectionSeconds,
      flingVelocity: defaultBottomSheetReleasePolicy.closeVelocity,
      maxAnchorSkip: Math.max(1, points.length),
      forwardSign: 1,
      ...options.releasePolicy,
    },
    resolveReleaseTarget({ snapshot, velocity }) {
      return resolveReleaseTarget(snapshot, velocity);
    },
  });

  function remeasure() {
    const anchors = createAnchors(readContext());
    const semanticId = motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id;
    const preservesSemanticId =
      semanticId !== undefined && anchors.some((anchor) => anchor.id === semanticId);
    return motion.remeasure({
      anchors,
      bounds: {
        min: Math.min(...anchors.map((anchor) => anchor.position)),
        max: Math.max(...anchors.map((anchor) => anchor.position)),
      },
      ...(preservesSemanticId ? { activeId: semanticId } : {}),
    });
  }

  useRemeasurement({ target: options.panel, measure: remeasure });

  function open(id: Id = defaultOpenSnapId) {
    remeasure();
    sheetState.value = "opening";
    return motion.moveTo(id);
  }

  function close() {
    sheetState.value = "closing";
    return motion.moveTo(HIDDEN_SNAP_ID);
  }

  function snapTo(id: Id) {
    if (resolvedSnapPoints.value.find((point) => point.id === id)?.disabled) return null;
    sheetState.value = "settling";
    return motion.moveTo(id);
  }

  function snapToNearest() {
    const openAnchors = motion.snapshot.value.anchors.filter(
      (anchor) => anchor.id !== HIDDEN_SNAP_ID,
    );
    const nearest = openAnchors.reduce(
      (current, candidate) =>
        !current ||
        Math.abs(candidate.position - motion.position.value) <
          Math.abs(current.position - motion.position.value)
          ? candidate
          : current,
      undefined as SnapAnchor<InternalBottomSheetSnapId<Id>> | undefined,
    );
    if (!nearest || nearest.id === HIDDEN_SNAP_ID) return null;
    sheetState.value = "settling";
    return motion.moveTo(nearest.id);
  }

  const activeSnapId = computed<Id | undefined>(() => {
    const id = motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id;
    return id === HIDDEN_SNAP_ID ? undefined : id;
  });
  const publicSnapshot = computed<ControllerSnapshot<Id>>(() => {
    const snapshot = motion.snapshot.value;
    const anchors = snapshot.anchors.filter(
      (anchor): anchor is SnapAnchor<Id> => anchor.id !== HIDDEN_SNAP_ID,
    );
    return {
      ...snapshot,
      active: snapshot.active?.id === HIDDEN_SNAP_ID ? null : snapshot.active,
      anchors,
      target: snapshot.target?.id === HIDDEN_SNAP_ID ? null : snapshot.target,
    } as ControllerSnapshot<Id>;
  });
  const openAnchors = computed(() =>
    motion.snapshot.value.anchors.filter((anchor) => anchor.id !== HIDDEN_SNAP_ID),
  );
  const fullPosition = computed(() =>
    Math.min(...openAnchors.value.map((anchor) => anchor.position)),
  );
  const hiddenPosition = computed(
    () =>
      internalAnchorById(motion.snapshot.value.anchors, HIDDEN_SNAP_ID)?.position ??
      viewportHeight.value,
  );
  const scrimOpacity = computed(() => {
    const range = Math.max(1, hiddenPosition.value - fullPosition.value);
    const progress =
      1 - Math.min(1, Math.max(0, (motion.position.value - fullPosition.value) / range));
    return Number((progress * Math.max(0, maximumScrimOpacity)).toFixed(3));
  });
  const transform = computed(
    () => `translate3d(0, ${motion.position.value - fullPosition.value}px, 0)`,
  );
  const panelStyle = computed(() => ({
    "--snap-motion-sheet-y": `${motion.position.value}px`,
    transform: transform.value,
    willChange: motion.isAnimating.value || motion.isDragging.value ? "transform" : "auto",
  }));

  watch(motion.phase, (phase) => {
    if (phase === "dragging") sheetState.value = "dragging";
  });

  return {
    activeId: activeSnapId,
    activeSnapId,
    close: () => {
      close();
    },
    configure: motion.configure,
    interrupt: motion.interrupt,
    isAnimating: motion.isAnimating,
    isDragging: motion.isDragging,
    onNativeDragStart: motion.onNativeDragStart,
    onPointerDown: motion.onPointerDown,
    open(id) {
      return open(id) as SnapAnchor<Id> | null;
    },
    panelStyle,
    phase: motion.phase,
    pointerIntent: motion.pointerIntent,
    pointerOwned: motion.pointerOwned,
    position: motion.position,
    reducedMotion: motion.reducedMotion,
    remeasure: () => remeasure() as SnapAnchor<Id> | null,
    resolvedSnapPoints: computed(() => resolvedSnapPoints.value),
    scrimOpacity,
    sheetState,
    snapTo: (id) => snapTo(id) as SnapAnchor<Id> | null,
    snapToNearest: () => snapToNearest() as SnapAnchor<Id> | null,
    snapshot: publicSnapshot,
    surfaceStyle: { touchAction: "none" },
    targetId: computed(() => publicSnapshot.value.target?.id),
    transform,
    velocity: motion.velocity,
    viewportHeight,
  };
}
