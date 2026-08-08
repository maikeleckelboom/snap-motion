/** Localizable strings shared by the public interaction features. */
export interface SnapMotionMessages {
  previousItem: string;
  nextItem: string;
  closeDialog: string;
  closeSheet: string;
  carouselInstructions: string;
  paginationLabel: string;
  progressLabel: string;
  itemStatus(context: { id: string; index: number; count: number; label?: string }): string;
  /**
   * Names an item together with where it sits. Spatial surfaces announce and label this way,
   * because "which one" and "how far through" are the same question when the rail is the content.
   */
  itemPositionStatus(context: { index: number; count: number; label?: string }): string;
  sheetStatus(context: { id: string; label: string }): string;
  sheetSnapLegend: string;
}

/** Creates an isolated English message set for one component tree or SSR request. */
export function createEnglishSnapMotionMessages(
  overrides: Partial<SnapMotionMessages> = {},
): SnapMotionMessages {
  return {
    previousItem: "Previous item",
    nextItem: "Next item",
    closeDialog: "Close dialog",
    closeSheet: "Close sheet",
    carouselInstructions:
      "Use Left and Right Arrow to move between items. Use Home and End to jump.",
    paginationLabel: "Choose an item",
    progressLabel: "Item progress",
    itemStatus: ({ index, count, label }) => label ?? `${index + 1} of ${count}`,
    itemPositionStatus: ({ index, count, label }) =>
      label === undefined ? `${index + 1} of ${count}` : `${label}, ${index + 1} of ${count}`,
    sheetStatus: ({ label }) => `Sheet position: ${label}`,
    sheetSnapLegend: "Sheet position",
    ...overrides,
  };
}
