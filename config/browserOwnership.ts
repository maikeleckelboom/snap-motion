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
export const interoperabilitySpecs = [
  "lab-physics-settings.spec.ts",
  "showcase-smoke.spec.ts",
  "stackedDeckConsumer.spec.ts",
  "stackedDeckTrace.spec.ts",
  "sheet.spec.ts",
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
    return { testIgnore: ["media-preview.spec.ts", ...chromiumDeckSpecs, ...chromiumDirectSpecs] };
  if (group === "deck") return { testMatch: chromiumDeckSpecs };
  if (group === "direct") return { testMatch: chromiumDirectSpecs };
  throw new Error(`Unknown Chromium browser group: ${group}`);
}
