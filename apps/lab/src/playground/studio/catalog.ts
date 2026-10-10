import type { MediaGalleryItem } from "@snap-motion/vue/media-gallery";

import {
  studyCategories,
  studyDefinitions,
  studyMediaKinds,
  studyMediaLabels,
  type StudyDefinition,
  type StudyId,
  type StudyMediaKind,
} from "./studies";

/** One plate of one study. It is a Gallery item, so the Gallery never needs a second catalog. */
export interface StudyMedia extends MediaGalleryItem {
  readonly studyId: StudyId;
  readonly kind: StudyMediaKind;
}

export interface Study extends StudyDefinition {
  readonly id: StudyId;
  readonly categoryLabel: string;
  /** The plate shown in the Grid, the Coverflow and the Deck. */
  readonly cover: StudyMedia;
  /** All of the study's plates, cover first. */
  readonly media: readonly StudyMedia[];
}

// Content-hashed local assets, resolved at build time. Nothing here touches the network at import:
// a plate is only requested when a surface renders it.
const plateUrls = import.meta.glob("../../assets/studio/*.svg", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const urlByFile = new Map(
  Object.entries(plateUrls).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]),
);

const plateSizes: Record<StudyMediaKind, { width: number; height: number }> = {
  cover: { width: 1_600, height: 1_120 },
  route: { width: 1_600, height: 1_000 },
  timing: { width: 1_600, height: 1_000 },
};

function describePlate(definition: StudyDefinition, kind: StudyMediaKind) {
  switch (kind) {
    case "cover":
      return {
        alt: `${definition.name} study plate: ${definition.motif}.`,
        description: definition.summary,
      };
    case "route":
      return {
        alt: `${definition.name} route diagram: the route drawn on a grid with its labelled anchors.`,
        description: `The ${definition.name} route and its anchors. Illustrative, not a measurement.`,
      };
    case "timing":
      return {
        alt: `${definition.name} timing curve: progress over time from release to rest.`,
        description: `An illustrative timing curve for ${definition.name}, drawn for character rather than measured.`,
      };
  }
}

function createMedia(definition: StudyDefinition, kind: StudyMediaKind): StudyMedia {
  const url = urlByFile.get(`${definition.id}-${kind}.svg`);
  if (url === undefined)
    throw new Error(`Missing Motion Studio plate ${definition.id}-${kind}.svg`);
  const source = { src: url, ...plateSizes[kind] };
  return {
    id: `${definition.id}/${kind}`,
    studyId: definition.id as StudyId,
    kind,
    title: `${definition.name} — ${studyMediaLabels[kind]}`,
    // The preview and the full image are one source: the Gallery renders a single layer for it.
    preview: source,
    full: source,
    ...describePlate(definition, kind),
  };
}

export const studies: readonly Study[] = studyDefinitions.map((definition) => {
  const media = studyMediaKinds.map((kind) => createMedia(definition, kind));
  return {
    ...definition,
    categoryLabel: studyCategories.find(({ id }) => id === definition.category)!.label,
    cover: media[0]!,
    media,
  } as Study;
});

export const studyById: ReadonlyMap<StudyId, Study> = new Map(
  studies.map((study) => [study.id, study]),
);

/** Every plate of every study, in collection order: the Gallery's one item list. */
export const galleryMedia: readonly StudyMedia[] = studies.flatMap((study) => study.media);

const studyIdByMediaId = new Map(galleryMedia.map((media) => [media.id, media.studyId]));

export function studyIdOfMedia(mediaId: string | undefined): StudyId | undefined {
  return mediaId === undefined ? undefined : studyIdByMediaId.get(mediaId);
}

export function coverMediaId(studyId: StudyId): string {
  return studyById.get(studyId)!.cover.id;
}
