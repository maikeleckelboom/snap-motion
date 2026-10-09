import emberDunesUrl from "@/assets/playground-gallery/ember-dunes.svg?url";
import highPassUrl from "@/assets/playground-gallery/high-pass.svg?url";
import longRangeUrl from "@/assets/playground-gallery/long-range.svg?url";
import moonOverRidgesUrl from "@/assets/playground-gallery/moon-over-ridges.svg?url";
import morningRidgeUrl from "@/assets/playground-gallery/morning-ridge.svg?url";
import saltFlatDuskUrl from "@/assets/playground-gallery/salt-flat-dusk.svg?url";
import type { MediaFixture } from "@/fixtures/media";

/**
 * The public gallery's plates: seeded illustrations from `scripts/generate-playground-media.mjs`.
 * They vary in aspect ratio (landscape, panorama, portrait, square) so containment, swipe order and
 * zoom are all visible, and every source is a local, content-hashed asset: no network, no
 * development-only endpoint.
 */
export const playgroundMedia: readonly MediaFixture[] = [
  {
    id: "morning-ridge",
    title: "Morning ridge",
    description: "Layered blue ridgelines under a peach dawn sky with a low sun.",
    intrinsicSize: { width: 2_400, height: 1_600 },
    src: morningRidgeUrl,
    mode: "regular",
  },
  {
    id: "long-range",
    title: "Long range",
    description: "A three-to-one panorama of overlapping golden-hour ridgelines.",
    intrinsicSize: { width: 3_600, height: 1_200 },
    src: longRangeUrl,
    mode: "wide",
  },
  {
    id: "moon-over-ridges",
    title: "Moon over the ridges",
    description: "A tall night scene: a pale moon and stars above stacked teal ridgelines.",
    intrinsicSize: { width: 1_600, height: 2_400 },
    src: moonOverRidgesUrl,
    mode: "tall",
  },
  {
    id: "high-pass",
    title: "High pass",
    description: "Snow-streaked alpine peaks in cold morning haze under a pale blue sky.",
    intrinsicSize: { width: 2_400, height: 1_600 },
    src: highPassUrl,
    mode: "regular",
  },
  {
    id: "salt-flat-dusk",
    title: "Salt flat at dusk",
    description: "A still salt flat mirroring a violet sky, distant hills and the last light.",
    intrinsicSize: { width: 2_400, height: 1_600 },
    src: saltFlatDuskUrl,
    mode: "regular",
  },
  {
    id: "ember-dunes",
    title: "Ember dunes",
    description: "Soft, sharply lit desert dunes in warm amber and rust under a hazy sun.",
    intrinsicSize: { width: 2_000, height: 2_000 },
    src: emberDunesUrl,
    mode: "regular",
  },
];
