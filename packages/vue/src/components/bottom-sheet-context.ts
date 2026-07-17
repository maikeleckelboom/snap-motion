import type { InjectionKey } from "vue";

import type { BottomSheetOpenSnapId } from "../bottom-sheet-policy";
import type { NavigationReason } from "./contracts";

export interface BottomSheetContext {
  activeId: () => BottomSheetOpenSnapId;
  labels: Record<BottomSheetOpenSnapId, string>;
  name: string;
  requestSnap: (id: BottomSheetOpenSnapId, reason: NavigationReason) => void;
}

export const bottomSheetContextKey = Symbol(
  "snap-motion-bottom-sheet",
) as InjectionKey<BottomSheetContext>;
