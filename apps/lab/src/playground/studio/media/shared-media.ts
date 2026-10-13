import highPassUrl from "@/assets/playground-gallery/high-pass.svg?url";
import longRangeUrl from "@/assets/playground-gallery/long-range.svg?url";
import moonOverRidgesUrl from "@/assets/playground-gallery/moon-over-ridges.svg?url";
import morningRidgeUrl from "@/assets/playground-gallery/morning-ridge.svg?url";
import saltFlatDuskUrl from "@/assets/playground-gallery/salt-flat-dusk.svg?url";
import campsiteBlueHourUrl from "@/assets/shared-media/campsite-blue-hour.svg?url";
import fogInTheValleyUrl from "@/assets/shared-media/fog-in-the-valley.svg?url";
import lastLightOnTheLakeUrl from "@/assets/shared-media/last-light-on-the-lake.svg?url";
import pineRidgeAtNoonUrl from "@/assets/shared-media/pine-ridge-at-noon.svg?url";
import stormOverTheSaddleUrl from "@/assets/shared-media/storm-over-the-saddle.svg?url";
import sunriseFromTheTentUrl from "@/assets/shared-media/sunrise-from-the-tent.svg?url";

import { sharedMediaData, type SharedMediaDatum, type SharedMediaId } from "./shared-media-data";

/** An id is just a string to the surfaces: they browse a collection and know nothing of this one. */
export interface SharedMediaItem extends Omit<SharedMediaDatum, "id"> {
  readonly id: string;
  /** A local, content-hashed asset: no network and no development-only endpoint. */
  readonly src: string;
}

const sources: Record<SharedMediaId, string> = {
  "campsite-blue-hour": campsiteBlueHourUrl,
  "fog-in-the-valley": fogInTheValleyUrl,
  "high-pass": highPassUrl,
  "last-light-on-the-lake": lastLightOnTheLakeUrl,
  "long-range": longRangeUrl,
  "moon-over-ridges": moonOverRidgesUrl,
  "morning-ridge": morningRidgeUrl,
  "pine-ridge-at-noon": pineRidgeAtNoonUrl,
  "salt-flat-dusk": saltFlatDuskUrl,
  "storm-over-the-saddle": stormOverTheSaddleUrl,
  "sunrise-from-the-tent": sunriseFromTheTentUrl,
};

export const sharedMedia: readonly SharedMediaItem[] = sharedMediaData.map((datum) => ({
  ...datum,
  src: sources[datum.id],
}));
