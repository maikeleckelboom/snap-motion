import type { ComputedRef, InjectionKey } from "vue";

import type { SnapMotionMessages } from "../localization/messages";
import type { NavigationReason } from "../motion/motion-contracts";
import type { ResolvedBottomSheetSnapPoint } from "./bottom-sheet-policy";

export interface BottomSheetContext<Id extends string = string> {
  activeId: ComputedRef<Id>;
  messages: ComputedRef<SnapMotionMessages>;
  name: string;
  points: ComputedRef<readonly ResolvedBottomSheetSnapPoint<Id>[]>;
  requestSnap: (id: Id, reason: NavigationReason) => void;
}

export const bottomSheetContextKey = Symbol(
  "snap-motion-bottom-sheet",
) as InjectionKey<BottomSheetContext>;
