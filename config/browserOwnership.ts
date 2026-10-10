export const chromiumDeckSpecs = [
  "stacked-deck.spec.ts",
  "stackedDeckConsumer.spec.ts",
  "stackedDeckTrace.spec.ts",
];
export const chromiumDirectSpecs = [
  "stacked-deck-direct.spec.ts",
  "stacked-deck-direct-reversal.spec.ts",
  "stacked-deck-pile.spec.ts",
];
/**
 * Specs that run against the built production preview under a non-root base, never against the
 * development server. They belong to the preview gate (`playwright.preview.config.ts`) alone.
 */
export const previewSpecs = ["media-preview.spec.ts", "playground-preview.spec.ts"];
/**
 * The Motion Studio's browser specs. They compose five surfaces and three overlays, so they own
 * their own parallel job on each engine instead of lengthening the general ones past their limits.
 * `studio-layout.spec.ts` is Chromium-only; `studio.spec.ts` is the one cross-engine spec.
 */
export const chromiumStudioSpecs = ["studio.spec.ts", "studio-layout.spec.ts"];
export const interoperabilityStudioSpecs = ["studio.spec.ts"];
export const interoperabilitySpecs = [
  "lab-physics-settings.spec.ts",
  "playground.spec.ts",
  "showcase-smoke.spec.ts",
  "stackedDeckConsumer.spec.ts",
  "stackedDeckTrace.spec.ts",
  "sheet.spec.ts",
  "sheetDismissal.spec.ts",
  "sheetContent.spec.ts",
  "surfaceState.spec.ts",
  "galleryTakeover.spec.ts",
  "galleryReturn.spec.ts",
];

export function chromiumScope(group: string | undefined): {
  testMatch?: string[];
  testIgnore?: string[];
} {
  if (group === undefined || group === "all") return {};
  if (group === "general")
    return {
      testIgnore: [
        ...previewSpecs,
        ...chromiumDeckSpecs,
        ...chromiumDirectSpecs,
        ...chromiumStudioSpecs,
      ],
    };
  if (group === "deck") return { testMatch: chromiumDeckSpecs };
  if (group === "direct") return { testMatch: chromiumDirectSpecs };
  if (group === "studio") return { testMatch: chromiumStudioSpecs };
  throw new Error(`Unknown Chromium browser group: ${group}`);
}
