import type { MediaGalleryItem } from "@snap-motion/vue/media-gallery";

import mapGalleryUrl from "@/assets/coverflow-gallery/map.svg?url";
import projectGalleryUrl from "@/assets/coverflow-gallery/project.svg?url";
import settingsGalleryUrl from "@/assets/coverflow-gallery/settings.svg?url";
import teamGalleryUrl from "@/assets/coverflow-gallery/team.svg?url";
import templatesGalleryUrl from "@/assets/coverflow-gallery/templates.svg?url";

export type ShowcaseScreenId = "templates" | "project" | "map" | "team" | "settings";
export type ShowcaseScreenLayout = "gallery" | "detail" | "canvas" | "roster" | "console";

export interface ShowcaseScreen extends MediaGalleryItem {
  readonly id: ShowcaseScreenId;
  readonly accent: string;
  readonly eyebrow: string;
  readonly layout: ShowcaseScreenLayout;
  readonly tone: "light" | "mist" | "ink";
}

function previewSource(url: string): MediaGalleryItem["preview"] {
  return {
    src: `${url}?thumbnail`,
    srcset: `${url}?thumbnail-800 800w, ${url}?thumbnail 1600w`,
    sizes: "(max-width: 48rem) 100vw, 50vw",
    width: 1_600,
    height: 1_000,
  };
}

function fullSource(url: string): MediaGalleryItem["full"] {
  return {
    src: `${url}?full`,
    srcset: `${url}?full-1600 1600w, ${url}?full-2400 2400w`,
    sizes: "100vw",
    width: 2_400,
    height: 1_500,
  };
}

export const showcaseScreens: readonly ShowcaseScreen[] = [
  {
    id: "templates",
    title: "Projectsjablonen",
    eyebrow: "Yoot Portaal",
    accent: "#2f6fed",
    tone: "light",
    layout: "gallery",
    alt: "Projects template gallery with a featured project structure and six template cards.",
    preview: previewSource(templatesGalleryUrl),
    full: fullSource(templatesGalleryUrl),
  },
  {
    id: "project",
    title: "Project 24031 — Horizon",
    eyebrow: "Projectdetail",
    accent: "#1f9d7a",
    tone: "mist",
    layout: "detail",
    alt: "Project Horizon detail screen with project settings, status rows, and progress.",
    preview: previewSource(projectGalleryUrl),
    full: fullSource(projectGalleryUrl),
  },
  {
    id: "map",
    title: "Locatie & planning",
    eyebrow: "Kaartweergave",
    accent: "#d9480f",
    tone: "light",
    layout: "canvas",
    alt: "Location and planning screen with a map, route lines, and a selected location.",
    preview: previewSource(mapGalleryUrl),
    full: fullSource(mapGalleryUrl),
  },
  {
    id: "team",
    title: "Team & rollen",
    eyebrow: "Organisatie",
    accent: "#7048e8",
    tone: "mist",
    layout: "roster",
    alt: "Team and roles screen with six member cards arranged in a roster.",
    preview: previewSource(teamGalleryUrl),
    full: fullSource(teamGalleryUrl),
  },
  {
    id: "settings",
    title: "Werkruimte-instellingen",
    eyebrow: "Beheer",
    accent: "#0b7285",
    tone: "ink",
    layout: "console",
    alt: "Dark workspace settings screen with four administrative setting rows.",
    preview: previewSource(settingsGalleryUrl),
    full: fullSource(settingsGalleryUrl),
  },
];
