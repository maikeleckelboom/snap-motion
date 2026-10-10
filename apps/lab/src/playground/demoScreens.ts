import collectionLibraryUrl from "@/assets/playground-screens/collectionLibrary.svg?url";
import motionAtlasUrl from "@/assets/playground-screens/motionAtlas.svg?url";
import sequenceEditorUrl from "@/assets/playground-screens/sequenceEditor.svg?url";
import signalMonitorUrl from "@/assets/playground-screens/signalMonitor.svg?url";
import surfaceSettingsUrl from "@/assets/playground-screens/surfaceSettings.svg?url";
import type { ShowcaseScreen } from "@/demos/showcaseScreens";

/** Keep the established semantic ring; presentation and inspection use the same local plate. */
const screenPlates = [
  {
    id: "templates",
    title: "Collection library",
    layout: "gallery",
    tone: "light",
    accent: "#b84924",
    url: collectionLibraryUrl,
    alt: "Snap Motion collection library with six geometric motion studies.",
  },
  {
    id: "project",
    title: "Sequence editor",
    layout: "detail",
    tone: "ink",
    accent: "#e7b48d",
    url: sequenceEditorUrl,
    alt: "Snap Motion sequence editor with position, scale and rotation tracks.",
  },
  {
    id: "map",
    title: "Motion atlas",
    layout: "canvas",
    tone: "mist",
    accent: "#b84924",
    url: motionAtlasUrl,
    alt: "Snap Motion atlas with a curved path, anchors and a selected Traverse study.",
  },
  {
    id: "team",
    title: "Signal monitor",
    layout: "roster",
    tone: "ink",
    accent: "#e7b48d",
    url: signalMonitorUrl,
    alt: "Snap Motion signal monitor with a response curve and peak, rest and target readings.",
  },
  {
    id: "settings",
    title: "Surface settings",
    layout: "console",
    tone: "light",
    accent: "#b84924",
    url: surfaceSettingsUrl,
    alt: "Snap Motion surface settings with four options and a sheet preview.",
  },
] as const;

export const playgroundScreens: readonly ShowcaseScreen[] = screenPlates.map(
  ({ url, ...screen }) => ({
    ...screen,
    eyebrow: "Snap Motion Studio",
    preview: { src: url, width: 1600, height: 1000 },
    full: { src: url, width: 1600, height: 1000 },
  }),
);
