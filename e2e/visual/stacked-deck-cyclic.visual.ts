import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  beginPointerAt,
  fastFlick,
  finishPointerBy,
  motionPitch,
  movePointerBy,
  destinations,
  viewport,
  waitForAuthority,
} from "../stackedDeckHarness";

const repoRoot = resolve(import.meta.dirname, "../..");
const revision = inspectGitRevision(repoRoot);
const artifactDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-cyclic-review",
  revision.identity,
);

async function settleAt(page: Page, id: (typeof STACKED_DECK_IDS)[number]): Promise<void> {
  const stage = viewport(page);
  await expectCarouselAt(stage, id);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  await page.waitForTimeout(220);
}

async function select(page: Page, index: number): Promise<void> {
  await destinations(page).nth(index).click();
  await settleAt(page, STACKED_DECK_IDS[index]!);
}

async function record(page: Page, name: string, run: () => Promise<void>): Promise<string> {
  const path = join(artifactDirectory, `${name}.webm`);
  await page.screencast.start({
    path,
    quality: 90,
    size: { width: 1_280, height: 720 },
  });
  await page.waitForTimeout(350);
  await run();
  await page.waitForTimeout(500);
  await page.screencast.stop();
  return path;
}

async function repeatControl(
  page: Page,
  control: "stacked-deck-next" | "stacked-deck-previous",
  ids: readonly (typeof STACKED_DECK_IDS)[number][],
): Promise<void> {
  for (const id of ids) {
    await page.getByTestId(control).click();
    await settleAt(page, id);
  }
}

test("records the accepted cyclic Stacked Deck review set", async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(artifactDirectory, { recursive: true });
  await openLabDemo(page, "stacked-deck", "no-preference");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [
        ...document.querySelectorAll<HTMLImageElement>("[data-snap-motion-stacked-deck-card] img"),
      ].map((image) => image.decode()),
    );
  });
  const stage = viewport(page);
  const pitch = await motionPitch(stage);
  const recordings: Record<string, string> = {};

  await page.getByTestId("stacked-deck-exchange-direct").click();
  await select(page, 3);
  recordings.directForward = await record(page, "direct-forward-wrap", () =>
    repeatControl(page, "stacked-deck-next", ["settings", "templates", "project"]),
  );

  await select(page, 1);
  recordings.directBackward = await record(page, "direct-backward-wrap", () =>
    repeatControl(page, "stacked-deck-previous", ["templates", "settings", "team"]),
  );

  await select(page, 4);
  recordings.directFastAlternating = await record(
    page,
    "direct-fast-alternating-wrap",
    async () => {
      for (const [direction, targetIndex] of [
        [1, 0],
        [-1, 4],
        [1, 0],
      ] as const) {
        await fastFlick(page, direction, pitch);
        await waitForAuthority(page, targetIndex);
        await expect(stage).toHaveAttribute("data-phase", "settling");
      }
      await settleAt(page, "templates");
    },
  );

  await page.getByTestId("stacked-deck-exchange-shuffle").click();
  await select(page, 3);
  recordings.shuffleForward = await record(page, "shuffle-forward-wrap", () =>
    repeatControl(page, "stacked-deck-next", ["settings", "templates", "project"]),
  );

  await select(page, 1);
  recordings.shuffleBackward = await record(page, "shuffle-backward-wrap", () =>
    repeatControl(page, "stacked-deck-previous", ["templates", "settings", "team"]),
  );

  await page.getByTestId("stacked-deck-exchange-direct").click();
  await page.getByTestId("stacked-deck-two-items").click();
  await settleAt(page, "team");
  recordings.twoItemDirections = await record(page, "two-item-forward-vs-backward", async () => {
    let origin = await beginPointerAt(stage, 0.5, 0.5);
    await movePointerBy(page, origin, -pitch * 0.72, 100, 220);
    await page.waitForTimeout(160);
    await finishPointerBy(page, origin, -pitch * 0.72, 100, 280, "pointerup");
    await settleAt(page, "settings");

    await page.getByTestId("stacked-deck-destination").selectOption("team");
    await settleAt(page, "team");
    origin = await beginPointerAt(stage, 0.5, 0.5);
    await movePointerBy(page, origin, pitch * 0.72, -100, 220);
    await page.waitForTimeout(160);
    await finishPointerBy(page, origin, pitch * 0.72, -100, 280, "pointerup");
    await settleAt(page, "settings");
  });

  await writeFile(
    join(artifactDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        recordings,
        revision,
        topology: "canonical cyclic ring with direction-authoritative local coordinates",
      },
      null,
      2,
    )}\n`,
  );
});
