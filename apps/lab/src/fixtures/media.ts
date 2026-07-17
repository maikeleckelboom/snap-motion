export interface MediaFixture {
  id: string;
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
    src: "/fixtures/regular.svg",
    mode: "regular",
  },
  {
    id: "extremely-wide",
    title: "Extremely wide",
    description: "A 12,000 by 1,600 intrinsic viewBox contained by one stage.",
    src: "/fixtures/extremely-wide.svg",
    mode: "wide",
  },
  {
    id: "extremely-tall",
    title: "Extremely tall",
    description: "A 1,600 by 12,000 intrinsic viewBox contained by one stage.",
    src: "/fixtures/extremely-tall.svg",
    mode: "tall",
  },
  {
    id: "transformed",
    title: "Transformed child",
    description: "The media layer is visually scaled without changing carousel geometry.",
    src: "/fixtures/transformed.svg",
    mode: "transformed",
  },
  {
    id: "delayed",
    title: "Delayed decode",
    description: "The source is attached after a short delay to exercise semantic remeasurement.",
    src: "/fixtures/delayed.svg",
    mode: "delayed",
  },
];
