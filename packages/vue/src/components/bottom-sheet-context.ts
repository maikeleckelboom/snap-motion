import type { ComputedRef, InjectionKey } from "vue";

import type { ResolvedBottomSheetSnapPoint } from "../bottom-sheet-policy.js";
import type { SnapMotionMessages } from "../messages.js";
import type { NavigationReason } from "./contracts.js";

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
