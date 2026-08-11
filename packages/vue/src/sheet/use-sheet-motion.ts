import type {
  AnimationDriver,
  ControllerConfigurationUpdate,
  ControllerSnapshot,
  ElasticityOptions,
  ReleaseTargetPolicy,
  SnapAnchor,
  SpringConfiguration,
} from "@snap-motion/core";
import type { PointerIntent } from "@snap-motion/vue/motion";
import { useEventListener } from "@vueuse/core";
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type CSSProperties,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

import { useRemeasurement } from "../internal/layout/remeasurement";
import { useSnapMotion } from "../motion/use-snap-motion";
import type { SheetAxis, SheetSide, SheetState } from "./sheet-contracts";
import { resolveSheetGeometry, type SheetGeometry } from "./sheet-geometry";
import {
  createDefaultSheetSnapPoints,
  defaultSheetOpenSnapId,
  defaultSheetReleasePolicy,
  defaultSheetViewportPolicy,
  resolveSheetReleaseAnchor,
  resolveSheetScrimOpacity,
  resolveSheetSnapAnchors,
  resolveSheetSnapPoints,
  sheetPrimarySurfaceExtent,
  type ResolvedSheetSnapPoint,
  type SheetMeasureContext,
  type SheetOpenSnapId,
  type SheetSnapPoint,
  type SheetViewportPolicy,
} from "./sheet-policy";
import { getSheetSideDescriptor, sheetTransform, toPhysicalSheetPosition } from "./sheet-side";

const HIDDEN_SNAP_ID = "__snap_motion_hidden__" as const;
type InternalSheetSnapId<Id extends string> = Id | typeof HIDDEN_SNAP_ID;

export interface SheetViewportDimensions {
  readonly blockSize: number;
  readonly inlineSize: number;
}

export interface UseSheetMotionOptions<Id extends string = SheetOpenSnapId> {
  body?: Readonly<Ref<HTMLElement | undefined>>;
  chrome?: Readonly<Ref<HTMLElement | undefined>>;
  defaultOpenSnapId?: Id;
  driver?: AnimationDriver;
  elasticity?: ElasticityOptions;
  getMeasureContext?: () => Partial<SheetMeasureContext>;
  initialSnapId?: Id | "hidden";
  initialViewportDimensions?: Partial<SheetViewportDimensions>;
  intrinsicBodyContent?: Readonly<Ref<HTMLElement | undefined>>;
  maximumScrimOpacity?: number;
  onHidden?: () => void;
  onSnap?: (id: Id) => void;
  onTargetSelected?: (id: Id) => void;
  panel: Ref<HTMLElement | undefined>;
  programmaticImpulse?: number;
  reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
  releasePolicy?: Partial<ReleaseTargetPolicy>;
  side?: SheetSide;
  snapPoints?: MaybeRefOrGetter<readonly SheetSnapPoint<Id>[] | undefined>;
  spring?: SpringConfiguration;
  viewportPolicy?: Partial<SheetViewportPolicy>;
}

export interface UseSheetMotionReturn<Id extends string = SheetOpenSnapId> {
  readonly activeSnapId: ComputedRef<Id | undefined>;
  readonly axis: ComputedRef<SheetAxis>;
  /** Latest measured body client block extent; not read on every motion frame. */
  readonly bodyClientBlockExtent: Ref<number>;
  /** Latest measured body scroll block extent; not read on every motion frame. */
  readonly bodyScrollBlockExtent: Ref<number>;
  /** Latest measured body scroll offset; not read on every motion frame. */
  readonly bodyScrollOffset: Ref<number>;
  readonly canonicalPosition: ComputedRef<number>;
  readonly close: () => void;
  readonly configure: (update: ControllerConfigurationUpdate) => void;
  /** Combines frame-live visible geometry with latest-measured body metrics. */
  readonly geometry: ComputedRef<SheetGeometry>;
  readonly interrupt: () => void;
  readonly intrinsicBodyContentBlockExtent: Ref<number>;
  readonly intrinsicContentPrimaryExtent: Ref<number>;
  readonly isAnimating: ComputedRef<boolean>;
  readonly isDragging: Ref<boolean>;
  readonly maximumBodyScrollOffset: ComputedRef<number>;
  readonly measuredChromeBlockExtent: Ref<number>;
  readonly mostOpenPosition: ComputedRef<number>;
  readonly onNativeDragStart: (event: DragEvent) => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly open: (id?: Id) => SnapAnchor<Id> | null;
  readonly panelStyle: ComputedRef<CSSProperties>;
  readonly phase: ComputedRef<ControllerSnapshot<Id>["phase"]>;
  readonly physicalPosition: ComputedRef<number>;
  readonly pointerIntent: Ref<PointerIntent>;
  readonly pointerOwned: Ref<boolean>;
  readonly position: ComputedRef<number>;
  readonly primarySurfaceExtent: ComputedRef<number>;
  readonly reducedMotion: ComputedRef<boolean>;
  readonly remeasure: (preferredId?: Id) => SnapAnchor<Id> | null;
  readonly resolvedSnapPoints: ComputedRef<readonly ResolvedSheetSnapPoint<Id>[]>;
  readonly scrimOpacity: ComputedRef<number>;
  readonly setSide: (side: SheetSide, preferredId?: Id) => SnapAnchor<Id> | null;
  readonly sheetState: Ref<SheetState>;
  readonly side: Ref<SheetSide>;
  readonly snapTo: (id: Id) => SnapAnchor<Id> | null;
  readonly snapToNearest: () => SnapAnchor<Id> | null;
  readonly snapshot: ComputedRef<ControllerSnapshot<Id>>;
  readonly surfaceStyle: { readonly touchAction: string };
  readonly targetId: ComputedRef<Id | undefined>;
  readonly transform: ComputedRef<string>;
  readonly velocity: ComputedRef<number>;
  readonly viewportBlockSize: Ref<number>;
  readonly viewportInlineSize: Ref<number>;
  readonly visibleBodyBlockExtent: ComputedRef<number>;
  readonly visiblePrimaryExtent: ComputedRef<number>;
}

interface BrowserSheetMeasurements {
  context: SheetMeasureContext;
  intrinsicBodyContentBlockExtent: number;
  measuredChromeBlockExtent: number;
}

function finiteNonNegative(value: number | undefined, fallback = 0) {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function measuredRect(element: HTMLElement | undefined) {
  const rect = element?.getBoundingClientRect();
  return {
    blockSize: finiteNonNegative(rect?.height),
    inlineSize: finiteNonNegative(rect?.width),
  };
}

function cssPixelValue(style: CSSStyleDeclaration | undefined, name: string, fallback: number) {
  const value = Number.parseFloat(style?.getPropertyValue(name) ?? "");
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function browserMeasureContext(
  fallback: SheetViewportDimensions,
  side: SheetSide,
  panel: HTMLElement | undefined,
  chrome: HTMLElement | undefined,
  intrinsicBodyContent: HTMLElement | undefined,
  policy: SheetViewportPolicy,
  overrides: Partial<SheetMeasureContext> = {},
): BrowserSheetMeasurements {
  const browser = typeof window === "undefined" ? undefined : window;
  const panelRect = measuredRect(panel);
  const chromeRect = measuredRect(chrome);
  const bodyContentRect = measuredRect(intrinsicBodyContent);
  const panelStyle = panel && browser ? browser.getComputedStyle(panel) : undefined;
  const safeAreaInsets = overrides.safeAreaInsets ?? {
    top: cssPixelValue(panelStyle, "--snap-motion-sheet-safe-area-top", 0),
    right: cssPixelValue(panelStyle, "--snap-motion-sheet-safe-area-right", 0),
    bottom: cssPixelValue(panelStyle, "--snap-motion-sheet-safe-area-bottom", 0),
    left: cssPixelValue(panelStyle, "--snap-motion-sheet-safe-area-left", 0),
  };
  const layoutViewportInlineSize = finiteNonNegative(
    overrides.layoutViewportInlineSize,
    browser?.innerWidth ?? fallback.inlineSize,
  );
  const layoutViewportBlockSize = finiteNonNegative(
    overrides.layoutViewportBlockSize,
    browser?.innerHeight ?? fallback.blockSize,
  );
  const visualViewportInlineSize = finiteNonNegative(
    overrides.visualViewportInlineSize,
    browser?.visualViewport?.width ?? layoutViewportInlineSize,
  );
  const visualViewportBlockSize = finiteNonNegative(
    overrides.visualViewportBlockSize,
    browser?.visualViewport?.height ?? layoutViewportBlockSize,
  );
  const descriptor = getSheetSideDescriptor(side);
  const oppositeEdgeGap = finiteNonNegative(
    overrides.oppositeEdgeGap,
    cssPixelValue(panelStyle, "--snap-motion-sheet-opposite-edge-gap", policy.oppositeEdgeGap),
  );
  const rawPrimaryViewportExtent =
    descriptor.axis === "y" ? visualViewportBlockSize : visualViewportInlineSize;
  const minimumViewportExtent = finiteNonNegative(
    policy.minimumViewportExtent,
    defaultSheetViewportPolicy.minimumViewportExtent,
  );
  const primaryViewportExtent = finiteNonNegative(
    overrides.primaryViewportExtent,
    Math.max(minimumViewportExtent, rawPrimaryViewportExtent),
  );
  const crossViewportExtent = finiteNonNegative(
    overrides.crossViewportExtent,
    descriptor.axis === "y" ? visualViewportInlineSize : visualViewportBlockSize,
  );
  const oppositeSafeArea = safeAreaInsets[descriptor.oppositeEdge];
  const defaultHorizontalExtent = Math.min(
    416,
    Math.max(0, primaryViewportExtent - oppositeEdgeGap - oppositeSafeArea),
  );
  const panelPrimaryExtent = finiteNonNegative(
    overrides.panelPrimaryExtent,
    descriptor.axis === "y"
      ? primaryViewportExtent
      : panelRect.inlineSize || defaultHorizontalExtent,
  );
  const panelCrossExtent = finiteNonNegative(
    overrides.panelCrossExtent,
    descriptor.axis === "y"
      ? panelRect.inlineSize || crossViewportExtent
      : panelRect.blockSize || crossViewportExtent,
  );
  const measuredChromeBlockExtent = chromeRect.blockSize;
  const intrinsicBodyContentBlockExtent = bodyContentRect.blockSize;
  const intrinsicContentPrimaryExtent = finiteNonNegative(
    overrides.intrinsicContentPrimaryExtent,
    descriptor.axis === "y"
      ? measuredChromeBlockExtent + intrinsicBodyContentBlockExtent
      : panelPrimaryExtent,
  );

  return {
    intrinsicBodyContentBlockExtent,
    measuredChromeBlockExtent,
    context: {
      axis: descriptor.axis,
      crossViewportExtent,
      hiddenOvershoot: finiteNonNegative(overrides.hiddenOvershoot, policy.hiddenOvershoot),
      intrinsicContentPrimaryExtent,
      layoutViewportBlockSize,
      layoutViewportInlineSize,
      oppositeEdgeGap,
      panelCrossExtent,
      panelPrimaryExtent,
      primaryViewportExtent,
      safeAreaInsets,
      side,
      visualViewportBlockSize,
      visualViewportInlineSize,
    },
  };
}

function internalAnchorById<Id extends string>(
  anchors: readonly SnapAnchor<InternalSheetSnapId<Id>>[],
  id: InternalSheetSnapId<Id>,
) {
  return anchors.find((candidate) => candidate.id === id);
}

function validPreferredId<Id extends string>(
  anchors: readonly SnapAnchor<InternalSheetSnapId<Id>>[],
  preferredId: Id | undefined,
) {
  return preferredId && anchors.some((anchor) => anchor.id === preferredId)
    ? preferredId
    : undefined;
}

export function useSheetMotion<Id extends string = SheetOpenSnapId>(
  options: UseSheetMotionOptions<Id>,
): UseSheetMotionReturn<Id> {
  const currentSide = ref<SheetSide>(options.side ?? "bottom");
  const policy = { ...defaultSheetViewportPolicy, ...options.viewportPolicy };
  const initialViewportDimensions: SheetViewportDimensions = {
    blockSize: options.initialViewportDimensions?.blockSize ?? 800,
    inlineSize: options.initialViewportDimensions?.inlineSize ?? 400,
  };
  const maximumScrimOpacity = options.maximumScrimOpacity ?? 0.56;
  const viewportInlineSize = ref(initialViewportDimensions.inlineSize);
  const viewportBlockSize = ref(initialViewportDimensions.blockSize);
  const measuredPrimarySurfaceExtent = ref(0);
  const measuredChromeBlockExtent = ref(0);
  const intrinsicBodyContentBlockExtent = ref(0);
  const intrinsicContentPrimaryExtent = ref(0);
  const bodyClientBlockExtent = ref(0);
  const bodyScrollBlockExtent = ref(0);
  const bodyScrollOffset = ref(0);
  const resolvedSnapPoints = shallowRef<readonly ResolvedSheetSnapPoint<Id>[]>([]);
  let bodyGeometryFrame: number | undefined;

  function pointsForSide(side = currentSide.value) {
    return (
      toValue(options.snapPoints) ??
      (createDefaultSheetSnapPoints(side, options.viewportPolicy) as readonly SheetSnapPoint<Id>[])
    );
  }

  function assertPoints(points: readonly SheetSnapPoint<Id>[]) {
    if (points.length === 0) throw new RangeError("Sheets require at least one snap point.");
    if (points.some((point) => point.id === HIDDEN_SNAP_ID)) {
      throw new RangeError(`${HIDDEN_SNAP_ID} is reserved for internal closing state.`);
    }
  }

  assertPoints(pointsForSide());

  function readBodyScrollGeometry() {
    const body = options.body?.value;
    if (!body) {
      bodyClientBlockExtent.value = 0;
      bodyScrollBlockExtent.value = 0;
      bodyScrollOffset.value = 0;
      return;
    }
    bodyClientBlockExtent.value = body.clientHeight;
    bodyScrollBlockExtent.value = body.scrollHeight;
    bodyScrollOffset.value = body.scrollTop;
  }

  function scheduleBodyScrollGeometryRead() {
    if (typeof window === "undefined" || bodyGeometryFrame !== undefined) return;
    bodyGeometryFrame = window.requestAnimationFrame(() => {
      bodyGeometryFrame = undefined;
      readBodyScrollGeometry();
    });
  }

  function readContext() {
    const measurements = browserMeasureContext(
      initialViewportDimensions,
      currentSide.value,
      options.panel.value,
      options.chrome?.value,
      options.intrinsicBodyContent?.value,
      policy,
      options.getMeasureContext?.() ?? {},
    );
    viewportInlineSize.value = measurements.context.visualViewportInlineSize;
    viewportBlockSize.value = measurements.context.visualViewportBlockSize;
    measuredPrimarySurfaceExtent.value = sheetPrimarySurfaceExtent(measurements.context);
    measuredChromeBlockExtent.value = measurements.measuredChromeBlockExtent;
    intrinsicBodyContentBlockExtent.value = measurements.intrinsicBodyContentBlockExtent;
    intrinsicContentPrimaryExtent.value = measurements.context.intrinsicContentPrimaryExtent;
    readBodyScrollGeometry();
    return measurements.context;
  }

  function createAnchors(context: SheetMeasureContext) {
    const points = pointsForSide();
    assertPoints(points);
    resolvedSnapPoints.value = resolveSheetSnapPoints(points, context);
    return resolveSheetSnapAnchors(points, context, HIDDEN_SNAP_ID) as readonly SnapAnchor<
      InternalSheetSnapId<Id>
    >[];
  }

  function enabledDefaultId(context: SheetMeasureContext) {
    const enabled = resolveSheetSnapPoints(pointsForSide(), context).filter(
      (point) => !point.disabled,
    );
    const requested = options.defaultOpenSnapId;
    if (requested && enabled.some((point) => point.id === requested)) return requested;
    const sideDefault = defaultSheetOpenSnapId(currentSide.value) as Id;
    if (enabled.some((point) => point.id === sideDefault)) return sideDefault;
    return enabled[0]!.id;
  }

  const initialContext = browserMeasureContext(
    initialViewportDimensions,
    currentSide.value,
    undefined,
    undefined,
    undefined,
    policy,
    options.getMeasureContext?.() ?? {},
  ).context;
  measuredPrimarySurfaceExtent.value = sheetPrimarySurfaceExtent(initialContext);
  const initialAnchors = createAnchors(initialContext);
  const initialSnapId = options.initialSnapId ?? "hidden";
  const internalInitialId =
    initialSnapId === "hidden" ? HIDDEN_SNAP_ID : (initialSnapId as InternalSheetSnapId<Id>);
  const initialTarget =
    internalAnchorById(initialAnchors, internalInitialId) ??
    internalAnchorById(initialAnchors, enabledDefaultId(initialContext)) ??
    initialAnchors[0]!;
  const sheetState = ref<SheetState>(initialSnapId === "hidden" ? "closed" : "open");

  const motion = useSnapMotion<InternalSheetSnapId<Id>>({
    ...options,
    anchors: initialAnchors,
    axis: () => getSheetSideDescriptor(currentSide.value).axis,
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
      scheduleBodyScrollGeometryRead();
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
    pointerDeltaMultiplier: () => getSheetSideDescriptor(currentSide.value).transformSign,
    pointerIntent: "immediate",
    releasePolicy: {
      projectionSeconds: defaultSheetReleasePolicy.projectionSeconds,
      flingVelocity: defaultSheetReleasePolicy.closeVelocity,
      maxAnchorSkip: Math.max(1, pointsForSide().length),
      forwardSign: 1,
      ...options.releasePolicy,
    },
    resolveReleaseTarget({ snapshot, velocity }) {
      return resolveSheetReleaseAnchor(
        snapshot.anchors,
        HIDDEN_SNAP_ID,
        snapshot.position,
        velocity,
        {
          closeVelocity:
            options.releasePolicy?.flingVelocity ?? defaultSheetReleasePolicy.closeVelocity,
          expandVelocity:
            options.releasePolicy?.flingVelocity ?? defaultSheetReleasePolicy.expandVelocity,
          projectionSeconds:
            options.releasePolicy?.projectionSeconds ?? defaultSheetReleasePolicy.projectionSeconds,
        },
      ).id;
    },
  });

  function remeasure(preferredId?: Id) {
    const context = readContext();
    const anchors = createAnchors(context);
    const semanticId = motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id;
    const closed = sheetState.value === "closed" || sheetState.value === "closing";
    const activeId = closed
      ? HIDDEN_SNAP_ID
      : (validPreferredId(anchors, preferredId) ??
        (semanticId !== undefined && anchors.some((anchor) => anchor.id === semanticId)
          ? semanticId
          : enabledDefaultId(context)));
    const target = motion.remeasure({
      anchors,
      bounds: {
        min: Math.min(...anchors.map((anchor) => anchor.position)),
        max: Math.max(...anchors.map((anchor) => anchor.position)),
      },
      activeId,
    });
    scheduleBodyScrollGeometryRead();
    return target;
  }

  function setSide(side: SheetSide, preferredId?: Id) {
    if (side === currentSide.value) {
      const target = remeasure(preferredId);
      return target?.id === HIDDEN_SNAP_ID ? null : (target as SnapAnchor<Id> | null);
    }
    motion.interrupt();
    currentSide.value = side;
    const target = remeasure(preferredId);
    if (sheetState.value !== "closed" && sheetState.value !== "closing") {
      sheetState.value = "open";
    }
    return target?.id === HIDDEN_SNAP_ID ? null : (target as SnapAnchor<Id> | null);
  }

  const primaryMeasurementTarget = options.chrome ?? options.intrinsicBodyContent ?? options.panel;
  useRemeasurement({
    deferResizeObserver: true,
    target: primaryMeasurementTarget,
    measure: remeasure,
    additionalTargets: [
      ...(options.chrome && options.intrinsicBodyContent ? [options.intrinsicBodyContent] : []),
      ...(primaryMeasurementTarget === options.panel ? [] : [options.panel]),
    ],
  });
  if (options.body) {
    useEventListener(options.body, "scroll", readBodyScrollGeometry, { passive: true });
  }

  function open(id?: Id) {
    const context = readContext();
    const requested = id ?? enabledDefaultId(context);
    remeasure(requested);
    sheetState.value = "opening";
    return motion.moveTo(requested);
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
      undefined as SnapAnchor<InternalSheetSnapId<Id>> | undefined,
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
  const mostOpenPosition = computed(() =>
    Math.min(...openAnchors.value.map((anchor) => anchor.position)),
  );
  const primarySurfaceExtent = computed(() => measuredPrimarySurfaceExtent.value);
  const scrimOpacity = computed(() =>
    resolveSheetScrimOpacity(
      motion.snapshot.value.anchors,
      HIDDEN_SNAP_ID,
      motion.position.value,
      maximumScrimOpacity,
    ),
  );
  const geometry = computed(() =>
    resolveSheetGeometry({
      bodyClientBlockExtent: bodyClientBlockExtent.value,
      bodyScrollBlockExtent: bodyScrollBlockExtent.value,
      bodyScrollOffset: bodyScrollOffset.value,
      canonicalPosition: motion.position.value,
      intrinsicBodyContentBlockExtent: intrinsicBodyContentBlockExtent.value,
      intrinsicContentPrimaryExtent: intrinsicContentPrimaryExtent.value,
      measuredChromeBlockExtent: measuredChromeBlockExtent.value,
      primarySurfaceExtent: primarySurfaceExtent.value,
      side: currentSide.value,
      viewportBlockSize: viewportBlockSize.value,
      viewportInlineSize: viewportInlineSize.value,
    }),
  );
  const maximumBodyScrollOffset = computed(() => geometry.value.maximumBodyScrollOffset);
  const visibleBodyBlockExtent = computed(() => geometry.value.visibleBodyBlockExtent);
  const visiblePrimaryExtent = computed(() => geometry.value.visiblePrimaryExtent);
  const physicalPosition = computed(() =>
    toPhysicalSheetPosition(currentSide.value, motion.position.value),
  );
  const transform = computed(() => sheetTransform(currentSide.value, motion.position.value));
  const panelStyle = computed<CSSProperties>(() => ({
    "--snap-motion-sheet-canonical-position": `${motion.position.value}px`,
    "--snap-motion-sheet-physical-position": `${physicalPosition.value}px`,
    "--snap-motion-sheet-primary-surface-extent": `${primarySurfaceExtent.value}px`,
    "--snap-motion-sheet-viewport-block-size": `${viewportBlockSize.value}px`,
    "--snap-motion-sheet-viewport-inline-size": `${viewportInlineSize.value}px`,
    "--snap-motion-sheet-visible-block-extent": `${geometry.value.visibleSheetBlockExtent}px`,
    "--snap-motion-sheet-visible-inline-extent": `${geometry.value.visibleSheetInlineExtent}px`,
    "--snap-motion-sheet-visible-primary-extent": `${visiblePrimaryExtent.value}px`,
    transform: transform.value,
    willChange: motion.isAnimating.value || motion.isDragging.value ? "transform" : "auto",
  }));

  watch(motion.phase, (phase) => {
    if (phase === "dragging") sheetState.value = "dragging";
  });
  onScopeDispose(() => {
    if (bodyGeometryFrame !== undefined && typeof window !== "undefined") {
      window.cancelAnimationFrame(bodyGeometryFrame);
    }
  });

  return {
    activeSnapId,
    axis: computed(() => getSheetSideDescriptor(currentSide.value).axis),
    bodyClientBlockExtent,
    bodyScrollBlockExtent,
    bodyScrollOffset,
    canonicalPosition: motion.position,
    close: () => {
      close();
    },
    configure: motion.configure,
    geometry,
    interrupt: motion.interrupt,
    intrinsicBodyContentBlockExtent,
    intrinsicContentPrimaryExtent,
    isAnimating: motion.isAnimating,
    isDragging: motion.isDragging,
    maximumBodyScrollOffset,
    measuredChromeBlockExtent,
    mostOpenPosition,
    onNativeDragStart: motion.onNativeDragStart,
    onPointerDown: motion.onPointerDown,
    open(id) {
      return open(id) as SnapAnchor<Id> | null;
    },
    panelStyle,
    phase: motion.phase,
    physicalPosition,
    pointerIntent: motion.pointerIntent,
    pointerOwned: motion.pointerOwned,
    position: motion.position,
    primarySurfaceExtent,
    reducedMotion: motion.reducedMotion,
    remeasure(preferredId) {
      const target = remeasure(preferredId);
      return target?.id === HIDDEN_SNAP_ID ? null : (target as SnapAnchor<Id> | null);
    },
    resolvedSnapPoints: computed(() => resolvedSnapPoints.value),
    scrimOpacity,
    setSide,
    sheetState,
    side: currentSide,
    snapTo: (id) => snapTo(id) as SnapAnchor<Id> | null,
    snapToNearest: () => snapToNearest() as SnapAnchor<Id> | null,
    snapshot: publicSnapshot,
    surfaceStyle: { touchAction: "none" },
    targetId: computed(() => publicSnapshot.value.target?.id),
    transform,
    velocity: motion.velocity,
    viewportBlockSize,
    viewportInlineSize,
    visibleBodyBlockExtent,
    visiblePrimaryExtent,
  };
}
