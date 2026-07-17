# Custom bottom-sheet snap points

Snap points use arbitrary stable string IDs and resolve to panel translation positions from a
normalized measurement context.

```ts
import { bottomSheetSnapPosition, type BottomSheetSnapPoint } from "@snap-motion/vue";

type SheetId = "peek" | "content" | "full";

const snapPoints = [
  { id: "peek", label: "Peek", resolve: bottomSheetSnapPosition.viewportFraction(0.72) },
  { id: "content", label: "Content", resolve: bottomSheetSnapPosition.intrinsicContent },
  {
    id: "full",
    label: "Full",
    resolve: bottomSheetSnapPosition.safeArea(bottomSheetSnapPosition.pixels(16)),
    disabled: ({ viewportHeight }) => viewportHeight < 480,
  },
] as const satisfies readonly BottomSheetSnapPoint<SheetId>[];
```

```vue
<BottomSheet v-model:active-id="activeId" v-model:open="open" :snap-points="snapPoints" />
```

Resolvers include pixels, viewport fractions, intrinsic content, safe-area composition, and min/max
composition. Disabled points stay visible but disabled in the native radio picker. Distinct IDs may
share one physical position. The internal hidden close position is never an open picker option.

`createViewportBottomSheetSnapPoints()` returns the built-in `full`, `comfortable`, and `compact`
preset. Recalculation preserves semantic IDs across viewport and Visual Viewport changes.
