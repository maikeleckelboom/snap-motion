import type { MediaGalleryMessages } from "./media-gallery-contracts";

export function createEnglishMediaGalleryMessages(
  overrides: Partial<MediaGalleryMessages> = {},
): MediaGalleryMessages {
  return {
    closeGallery: "Close gallery",
    previousItem: ({ title }) => (title ? `Previous item: ${title}` : "Previous item"),
    nextItem: ({ title }) => (title ? `Next item: ${title}` : "Next item"),
    position: ({ index, count }) => `${index + 1} / ${count}`,
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Fit",
    retry: "Retry",
    loadingFullImage: "Loading full image…",
    fullImageUnavailable: "Full image unavailable.",
    previewFallback: "Showing the preview.",
    previewUnavailable: "Preview unavailable.",
    zoomControls: "Image zoom controls",
    zoomLabel: "Zoom",
    currentItem: ({ title, index, count }) => `${title}, ${index + 1} of ${count}`,
    gestureInstructions: "Swipe at fit · drag to pan when zoomed · pinch or double-tap to zoom",
    ...overrides,
  };
}
