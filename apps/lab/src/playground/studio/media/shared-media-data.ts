/**
 * The Studio's task: browsing the photos shared in a conversation.
 *
 * The conversation is fictional ("Ridge Crew", five friends on a weekend hike) and so is every name
 * and message. The pictures are the Playground's own seeded illustrations, so nothing is fetched,
 * licensed or borrowed from a messaging product. Both stages of a comparison browse this one
 * collection, in this one order, so the only thing that differs between them is the behaviour being
 * compared.
 *
 * This file is plain data: no framework and no asset import, so the model, the unit tests and the
 * browser specs read it directly. `shared-media.ts` gives each item its image.
 */

export type SharedMediaId =
  | "campsite-blue-hour"
  | "sunrise-from-the-tent"
  | "morning-ridge"
  | "fog-in-the-valley"
  | "high-pass"
  | "pine-ridge-at-noon"
  | "long-range"
  | "storm-over-the-saddle"
  | "last-light-on-the-lake"
  | "moon-over-ridges"
  | "salt-flat-dusk";

export interface SharedMediaDatum {
  readonly id: SharedMediaId;
  readonly title: string;
  /** What the picture shows, for the image's text alternative. */
  readonly alt: string;
  readonly sender: string;
  /** When it was sent, as a chat shows it. */
  readonly sentAt: string;
  /** The message that came with it. */
  readonly message: string;
  /** Intrinsic pixel size. It fixes the item's aspect ratio before the image has loaded. */
  readonly width: number;
  readonly height: number;
}

export const conversation = {
  name: "Ridge Crew",
  /** Initials in the header's avatar. */
  initials: "RC",
  members: 5,
} as const;

/** In the order they were sent, oldest first. Shapes vary on purpose: tall, square, wide, panorama. */
export const sharedMediaData: readonly SharedMediaDatum[] = [
  {
    id: "campsite-blue-hour",
    title: "Campsite at blue hour",
    alt: "A tall dusk scene with deep blue ridges and a warm lantern glow low over camp.",
    sender: "Noor",
    sentAt: "Fri 20:12",
    message: "Camp is up. Lantern is on.",
    width: 1600,
    height: 2000,
  },
  {
    id: "sunrise-from-the-tent",
    title: "Sunrise from the tent",
    alt: "A very tall frame with a thin band of ridges under a rose and amber sunrise.",
    sender: "Jonas",
    sentAt: "Sat 05:48",
    message: "Wake up, you are missing this.",
    width: 1350,
    height: 2400,
  },
  {
    id: "morning-ridge",
    title: "Morning ridge",
    alt: "Layered blue ridgelines under a peach dawn sky with a low sun.",
    sender: "Priya",
    sentAt: "Sat 06:42",
    message: "Worth the 5 am start.",
    width: 2400,
    height: 1600,
  },
  {
    id: "fog-in-the-valley",
    title: "Fog in the valley",
    alt: "Green ridges fading into low morning fog.",
    sender: "Tomás",
    sentAt: "Sat 08:03",
    message: "Fog is burning off below us.",
    width: 2400,
    height: 1350,
  },
  {
    id: "high-pass",
    title: "High pass",
    alt: "Snow-streaked alpine peaks in cold morning haze under a pale blue sky.",
    sender: "Mei",
    sentAt: "Sat 10:26",
    message: "Snow on the pass already.",
    width: 2400,
    height: 1600,
  },
  {
    id: "pine-ridge-at-noon",
    title: "Pine ridge at noon",
    alt: "Bright green ridgelines under a clear high-noon sky.",
    sender: "Noor",
    sentAt: "Sat 12:51",
    message: "Lunch spot. Best view of the trip so far.",
    width: 1800,
    height: 1800,
  },
  {
    id: "long-range",
    title: "Long range",
    alt: "A three-to-one panorama of overlapping golden-hour ridgelines.",
    sender: "Tomás",
    sentAt: "Sat 15:30",
    message: "The whole range from the saddle.",
    width: 3600,
    height: 1200,
  },
  {
    id: "storm-over-the-saddle",
    title: "Storm over the saddle",
    alt: "A heavy slate sky breaking over dark ridges, with one bright seam at the horizon.",
    sender: "Jonas",
    sentAt: "Sat 17:14",
    message: "Weather is turning. Heading down.",
    width: 2000,
    height: 1600,
  },
  {
    id: "last-light-on-the-lake",
    title: "Last light on the lake",
    alt: "A still alpine lake holding gold and teal reflections of the evening ridge.",
    sender: "Priya",
    sentAt: "Sat 19:40",
    message: "Best swim of the year.",
    width: 2400,
    height: 1600,
  },
  {
    id: "moon-over-ridges",
    title: "Moon over the ridges",
    alt: "A tall night scene with a pale moon and stars above stacked teal ridgelines.",
    sender: "Mei",
    sentAt: "Sat 22:05",
    message: "Cannot sleep. Look at this.",
    width: 1600,
    height: 2400,
  },
  {
    id: "salt-flat-dusk",
    title: "Salt flat at dusk",
    alt: "A still salt flat mirroring a violet sky, distant hills and the last light.",
    sender: "Noor",
    sentAt: "Sun 17:55",
    message: "Detour on the drive home.",
    width: 2400,
    height: 1600,
  },
];

export const sharedMediaIds: readonly SharedMediaId[] = sharedMediaData.map(({ id }) => id);

/** Width over height: the one number an item's layout is derived from. */
export function aspectRatio(item: Pick<SharedMediaDatum, "height" | "width">): number {
  return item.width / item.height;
}

/** The item a browse starts on, and a reset returns to: the middle, which has a neighbour each way. */
export function homeMediaId(items: readonly { readonly id: string }[] = sharedMediaData): string {
  return items[Math.floor(items.length / 2)]!.id;
}
