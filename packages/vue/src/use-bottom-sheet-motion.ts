import type { ControllerSnapshot, ReleaseTargetPolicy, SnapAnchor } from "@snap-motion/core";
import { computed, ref, watch, type Ref } from "vue";

import {
  defaultBottomSheetReleasePolicy,
  resolveBottomSheetReleaseAnchor,
  resolveBottomSheetScrimOpacity,
  resolveBottomSheetSnapAnchors,
  type BottomSheetOpenSnapId,
  type BottomSheetSnapId,
  type BottomSheetViewportPolicy,
} from "./bottom-sheet-policy";
import { useRemeasurement } from "./remeasurement";
import { useSnapMotion, type UseSnapMotionOptions } from "./use-snap-motion";

export type BottomSheetState = "closed" | "closing" | "dragging" | "open" | "opening" | "settling";

export interface UseBottomSheetMotionOptions extends Omit<
  UseSnapMotionOptions<BottomSheetSnapId>,
  | "anchors"
  | "axis"
  | "bounds"
  | "initialPosition"
  | "initialTargetId"
  | "onComplete"
  | "pointerIntent"
  | "releasePolicy"
> {
  defaultOpenSnapId?: BottomSheetOpenSnapId;
  getViewportHeight?: () => number;
  initialSnapId?: BottomSheetSnapId;
  initialViewportHeight?: number;
  maximumScrimOpacity?: number;
  onHidden?: () => void;
  onSnap?: (id: BottomSheetOpenSnapId) => void;
  panel: Ref<HTMLElement | undefined>;
  releasePolicy?: Partial<ReleaseTargetPolicy>;
  viewportPolicy?: Partial<BottomSheetViewportPolicy>;
}

function browserViewportHeight(fallback: number) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.visualViewport?.height ?? window.innerHeight;
}

function anchorById(anchors: readonly SnapAnchor<BottomSheetSnapId>[], id: BottomSheetSnapId) {
  const anchor = anchors.find((candidate) => candidate.id === id);
  if (!anchor) {
    throw new Error(`Missing bottom-sheet snap anchor: ${id}`);
  }
  return anchor;
}

export function useBottomSheetMotion(options: UseBottomSheetMotionOptions) {
  const {
    defaultOpenSnapId = "comfortable",
    getViewportHeight,
    initialSnapId = "hidden",
    initialViewportHeight = 800,
    maximumScrimOpacity = 0.56,
    onChange,
    onHidden,
    onSnap,
    panel,
    releasePolicy,
    viewportPolicy,
    ...snapOptions
  } = options;
  const viewportHeight = ref(initialViewportHeight);
  const initialAnchors = resolveBottomSheetSnapAnchors(viewportHeight.value, viewportPolicy ?? {});
  const initialTarget = anchorById(initialAnchors, initialSnapId);
  const sheetState = ref<BottomSheetState>(initialSnapId === "hidden" ? "closed" : "open");

  function handleControllerChange(snapshot: ControllerSnapshot<BottomSheetSnapId>) {
    if (snapshot.phase === "dragging") {
      sheetState.value = "dragging";
    } else if (
      snapshot.phase === "settling" &&
      sheetState.value !== "opening" &&
      sheetState.value !== "closing"
    ) {
      sheetState.value = "settling";
    }
    onChange?.(snapshot);
  }

  const motion = useSnapMotion<BottomSheetSnapId>({
    ...snapOptions,
    anchors: initialAnchors,
    axis: "y",
    bounds: {
      min: initialAnchors[0]?.position ?? 0,
      max: initialAnchors.at(-1)?.position ?? 0,
    },
    initialPosition: initialTarget.position,
    initialTargetId: initialTarget.id,
    elasticity: snapOptions.elasticity ?? {
      min: { resistance: 2.4, maxDistance: 56 },
      max: false,
    },
    onChange: handleControllerChange,
    onComplete(target) {
      if (target.id === "hidden") {
        sheetState.value = "closed";
        onHidden?.();
        return;
      }

      sheetState.value = "open";
      onSnap?.(target.id);
    },
    pointerIntent: "immediate",
    releasePolicy: {
      projectionSeconds: defaultBottomSheetReleasePolicy.projectionSeconds,
      flingVelocity: defaultBottomSheetReleasePolicy.closeVelocity,
      maxAnchorSkip: 3,
      forwardSign: 1,
      ...releasePolicy,
    },
    resolveReleaseTarget({ snapshot, velocity }) {
      return resolveBottomSheetReleaseAnchor(snapshot.anchors, snapshot.position, velocity, {
        closeVelocity:
          releasePolicy?.flingVelocity ?? defaultBottomSheetReleasePolicy.closeVelocity,
        expandVelocity:
          releasePolicy?.flingVelocity ?? defaultBottomSheetReleasePolicy.expandVelocity,
        projectionSeconds:
          releasePolicy?.projectionSeconds ?? defaultBottomSheetReleasePolicy.projectionSeconds,
      }).id;
    },
  });

  function readViewportHeight() {
    const measured = getViewportHeight?.() ?? browserViewportHeight(initialViewportHeight);
    viewportHeight.value = measured;
    return measured;
  }

  function remeasure() {
    const anchors = resolveBottomSheetSnapAnchors(readViewportHeight(), viewportPolicy ?? {});
    const semanticId = motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id;
    const preservesSemanticId =
      semanticId !== undefined && anchors.some((anchor) => anchor.id === semanticId);

    return motion.remeasure({
      anchors,
      bounds: {
        min: anchorById(anchors, "full").position,
        max: anchorById(anchors, "hidden").position,
      },
      ...(preservesSemanticId ? { activeId: semanticId } : {}),
    });
  }

  useRemeasurement({ target: panel, measure: remeasure });

  function open(id: BottomSheetOpenSnapId = defaultOpenSnapId) {
    remeasure();
    sheetState.value = "opening";
    return motion.moveTo(id);
  }

  function close() {
    sheetState.value = "closing";
    return motion.moveTo("hidden");
  }

  function snapTo(id: BottomSheetSnapId) {
    sheetState.value = id === "hidden" ? "closing" : "settling";
    return motion.moveTo(id);
  }

  function snapToNearest() {
    const openAnchors = motion.snapshot.value.anchors.filter((anchor) => anchor.id !== "hidden");
    const first = openAnchors[0];
    if (!first) {
      return null;
    }
    const nearest = openAnchors.reduce((current, candidate) =>
      Math.abs(candidate.position - motion.position.value) <
      Math.abs(current.position - motion.position.value)
        ? candidate
        : current,
    );
    sheetState.value = "settling";
    return motion.moveTo(nearest.id);
  }

  const activeSnapId = computed(
    () => motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id,
  );
  const scrimOpacity = computed(() =>
    resolveBottomSheetScrimOpacity(
      motion.snapshot.value.anchors,
      motion.position.value,
      maximumScrimOpacity,
    ),
  );
  const fullPosition = computed(() => anchorById(motion.snapshot.value.anchors, "full").position);
  const transform = computed(
    () => `translate3d(0, ${motion.position.value - fullPosition.value}px, 0)`,
  );
  const panelStyle = computed(() => ({
    "--snap-motion-sheet-y": `${motion.position.value}px`,
    transform: transform.value,
    willChange: motion.isAnimating.value || motion.isDragging.value ? "transform" : "auto",
  }));

  watch(motion.phase, (phase) => {
    if (phase === "dragging") {
      sheetState.value = "dragging";
    }
  });

  return {
    ...motion,
    activeSnapId,
    close,
    open,
    panelStyle,
    remeasure,
    scrimOpacity,
    sheetState,
    snapTo,
    snapToNearest,
    surfaceStyle: { touchAction: "none" },
    transform,
    viewportHeight,
  };
}
