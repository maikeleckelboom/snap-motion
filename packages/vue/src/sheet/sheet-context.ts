import type { ComputedRef, InjectionKey } from "vue";

import type { SnapMotionMessages } from "../localization/messages";
import type { SheetNavigationReason } from "./sheet-contracts";
import type { ResolvedSheetSnapPoint } from "./sheet-policy";

export interface SheetContext<Id extends string = string> {
  activeId: ComputedRef<Id>;
  messages: ComputedRef<SnapMotionMessages>;
  name: string;
  points: ComputedRef<readonly ResolvedSheetSnapPoint<Id>[]>;
  requestSnap: (id: Id, reason: SheetNavigationReason) => void;
}

export const sheetContextKey = Symbol("snap-motion-sheet") as InjectionKey<SheetContext>;
