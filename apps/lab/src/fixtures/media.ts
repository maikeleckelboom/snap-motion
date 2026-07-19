import delayedUrl from "@/assets/media-fixtures/delayed.svg?url";
import extremelyTallUrl from "@/assets/media-fixtures/extremely-tall.svg?url";
import extremelyWideUrl from "@/assets/media-fixtures/extremely-wide.svg?url";
import regularUrl from "@/assets/media-fixtures/regular.svg?url";
import transformedUrl from "@/assets/media-fixtures/transformed.svg?url";

export type MediaFixtureId =
  | "regular"
  | "extremely-wide"
  | "extremely-tall"
  | "transformed"
  | "delayed";

export interface MediaFixture {
  id: MediaFixtureId;
  title: string;
  description: string;
  src: string;
  mode: "regular" | "wide" | "tall" | "transformed" | "delayed";
}

export const mediaFixtures: MediaFixture[] = [
  {
    id: "regular",
    title: "Regular landscape",
    description: "A conventional 8:5 media frame.",
    src: regularUrl,
    mode: "regular",
  },
  {
    id: "extremely-wide",
    title: "Extremely wide",
    description: "A 12,000 by 1,600 intrinsic viewBox contained by one stage.",
    src: extremelyWideUrl,
    mode: "wide",
  },
  {
    id: "extremely-tall",
    title: "Extremely tall",
    description: "A 1,600 by 12,000 intrinsic viewBox contained by one stage.",
    src: extremelyTallUrl,
    mode: "tall",
  },
  {
    id: "transformed",
    title: "Transformed child",
    description: "The media layer is visually scaled without changing carousel geometry.",
    src: transformedUrl,
    mode: "transformed",
  },
  {
    id: "delayed",
    title: "Delayed decode",
    description: "The source is attached after a short delay to exercise semantic remeasurement.",
    src: delayedUrl,
    mode: "delayed",
  },
];
