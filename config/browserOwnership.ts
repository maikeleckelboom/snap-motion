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
];

export function chromiumScope(group: string | undefined): {
  testMatch?: string[];
  testIgnore?: string[];
} {
  if (group === undefined || group === "all") return {};
  if (group === "general")
    return { testIgnore: [...previewSpecs, ...chromiumDeckSpecs, ...chromiumDirectSpecs] };
  if (group === "deck") return { testMatch: chromiumDeckSpecs };
  if (group === "direct") return { testMatch: chromiumDirectSpecs };
  throw new Error(`Unknown Chromium browser group: ${group}`);
}
