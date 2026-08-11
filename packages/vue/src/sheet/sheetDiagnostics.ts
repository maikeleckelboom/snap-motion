import type { SurfaceMotionDiagnostics } from "@snap-motion/vue/motion";

import type { SheetSide, SheetState } from "./sheet-contracts";
import type { SheetGeometry } from "./sheet-geometry";

/** Read-only transient state exposed by the high-level Sheet handle. */
export interface SheetDiagnostics<Id extends string = string> extends SurfaceMotionDiagnostics<Id> {
  readonly geometry: SheetGeometry;
  readonly primarySurfaceExtent: number;
  readonly sheetState: SheetState;
  readonly side: SheetSide;
}
