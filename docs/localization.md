# Localization

Pass an isolated partial `messages` object to each root. The English factory creates a new object;
there is no mutable singleton and different locales can safely coexist during SSR.

```ts
import { createEnglishSnapMotionMessages } from "@snap-motion/vue";

const nl = createEnglishSnapMotionMessages({
  previousItem: "Vorig item",
  nextItem: "Volgend item",
  closeDialog: "Dialoog sluiten",
  closeBottomSheet: "Paneel sluiten",
  carouselInstructions: "Gebruik Pijl links en Pijl rechts om tussen items te bewegen.",
  paginationLabel: "Kies een item",
  progressLabel: "Voortgang",
  itemStatus: ({ index, count, label }) => label ?? `${index + 1} van ${count}`,
  sheetStatus: ({ label }) => `Paneelhoogte: ${label}`,
  sheetSnapLegend: "Paneelhoogte",
});
```

```vue
<CarouselRoot :messages="nl" ... />
```

Direct label props remain available for instance-specific names. Status text is produced only when
the selected semantic target settles, preventing duplicate live-region announcements.
