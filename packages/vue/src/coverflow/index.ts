export { default as Coverflow } from "./components/Coverflow.vue";
export type {
  CoverflowCardPresentation,
  CoverflowCardState,
  CoverflowTuning,
} from "./coverflow-contracts";
export { useCoverflowMotion } from "./use-coverflow-motion";
export type {
  CoverflowHandle,
  UseCoverflowMotionOptions,
  UseCoverflowMotionReturn,
} from "./use-coverflow-motion";
export type { CarouselMotion } from "../carousel/carousel-contracts";
export type { PointerIntent } from "../internal/input/pointer-policy";
export type { SurfaceMotionDiagnostics } from "../internal/surface/surface-diagnostics";
export type { NavigationReason } from "../motion/motion-contracts";
