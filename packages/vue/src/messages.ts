export interface SnapMotionMessages {
  previousItem: string;
  nextItem: string;
  closeDialog: string;
  closeBottomSheet: string;
  carouselInstructions: string;
  paginationLabel: string;
  progressLabel: string;
  itemStatus(context: { id: string; index: number; count: number; label?: string }): string;
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
    closeBottomSheet: "Close bottom sheet",
    carouselInstructions:
      "Use Left and Right Arrow to move between items. Use Home and End to jump.",
    paginationLabel: "Choose an item",
    progressLabel: "Item progress",
    itemStatus: ({ index, count, label }) => label ?? `${index + 1} of ${count}`,
    sheetStatus: ({ label }) => `Sheet height: ${label}`,
    sheetSnapLegend: "Sheet height",
    ...overrides,
  };
}
