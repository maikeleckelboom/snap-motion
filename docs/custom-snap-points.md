# Custom sheet snap points

Snap points use arbitrary stable string IDs and resolve the amount of the fixed sheet surface that
is visible on its primary axis. Consumer code never needs to invert top or left coordinates.

```ts
import { sheetSnapVisibleExtent, type SheetSnapPoint } from "@snap-motion/vue/sheet";

type SheetId = "peek" | "content" | "full";

const snapPoints = [
  { id: "peek", label: "Peek", resolveVisibleExtent: sheetSnapVisibleExtent.pixels(176) },
  {
    id: "content",
    label: "Content",
    resolveVisibleExtent: sheetSnapVisibleExtent.intrinsicContent,
  },
  {
    id: "full",
    label: "Full",
    resolveVisibleExtent: sheetSnapVisibleExtent.viewportFraction(0.8),
    disabled: ({ primaryViewportExtent }) => primaryViewportExtent < 480,
  },
] as const satisfies readonly SheetSnapPoint<SheetId>[];
```

```vue
<Sheet v-model:active-id="activeId" v-model:open="open" side="left" :snap-points="snapPoints" />
```

Resolvers include pixels, viewport fractions, intrinsic content, safe-area composition, and min/max
composition. The context exposes physical `side`, neutral `axis`, layout and visual viewport inline
and block sizes, primary and cross extents, measured panel extents, all four safe-area insets,
opposite-edge gap, hidden overshoot, and intrinsic primary-axis content extent.

Disabled points stay visible but disabled in the native radio picker. Distinct IDs may share one
canonical position. The internal hidden closing anchor is never a consumer snap point.

`createViewportSheetSnapPoints()` returns the `full`, `comfortable`, and `compact` defaults used by
vertical sheets. `createFixedSheetSnapPoints()` returns the single `open` default for left and
right sheets. A horizontal custom point reveals less of the already-laid-out fixed-width surface;
it does not resize the surface or reflow text while dragging. Remeasurement and side changes retain
the semantic ID when valid, then use the new side default or first configured point as fallback.
