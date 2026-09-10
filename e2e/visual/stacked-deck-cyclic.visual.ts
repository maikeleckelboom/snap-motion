import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  beginHeldTraversal,
  destinations,
  fastFlick,
  finishPointer,
  holdPhysicalIndex,
  motionPitch,
  viewport,
  waitForAuthority,
} from "../stackedDeckHarness";
import {
  captureAutonomousPileScenario,
  captureHeldPileScenario,
  installHighContrastPileFixture,
  type PileScenarioTrace,
  type PileTraceDirection,
  type PileTraceExchange,
} from "../stackedDeckPileTrace";

const repoRoot = resolve(import.meta.dirname, "../..");
const revision = inspectGitRevision(repoRoot);
const artifactDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-cyclic-review",
  revision.identity,
);
const stripProgress = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7] as const;

async function settleAt(page: Page, index: number): Promise<void> {
  const stage = viewport(page);
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  await page.waitForTimeout(180);
}

async function select(page: Page, index: number): Promise<void> {
  await destinations(page).nth(index).click();
  await settleAt(page, index);
}

async function record(page: Page, name: string, run: () => Promise<void>): Promise<string> {
  const path = join(artifactDirectory, `${name}.webm`);
  await page.screencast.start({
    path,
    quality: 94,
    size: { width: 1_280, height: 720 },
  });
  await page.waitForTimeout(300);
  await run();
  await page.waitForTimeout(500);
  await page.screencast.stop();
  return path;
}

async function recordSlowExchange(
  page: Page,
  exchange: PileTraceExchange,
  sourceIndex: number,
  direction: PileTraceDirection,
  name: string,
): Promise<string> {
  await page.getByTestId(`stacked-deck-exchange-${exchange}`).click();
  await select(page, sourceIndex);
  return record(page, name, async () => {
    const held = await beginHeldTraversal(page, sourceIndex);
    for (let step = 1; step <= 40; step += 1) {
      await holdPhysicalIndex(page, held, sourceIndex + (direction * step * 0.95) / 40, 30);
      await page.waitForTimeout(42);
    }
    await page.waitForTimeout(240);
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 0.95,
      held.elapsedMs + 80,
      "pointerup",
    );
    await settleAt(
      page,
      (sourceIndex + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length,
    );
  });
}

async function writeStrip(
  page: Page,
  exchange: PileTraceExchange,
  sourceIndex: number,
  direction: PileTraceDirection,
  name: string,
): Promise<string> {
  await page.getByTestId(`stacked-deck-exchange-${exchange}`).click();
  await select(page, sourceIndex);
  const held = await beginHeldTraversal(page, sourceIndex);
  const encodedFrames: string[] = [];
  try {
    for (const progress of stripProgress) {
      await holdPhysicalIndex(page, held, sourceIndex + direction * progress, 45);
      encodedFrames.push((await viewport(page).screenshot({ type: "png" })).toString("base64"));
    }
  } finally {
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * stripProgress.at(-1)!,
      held.elapsedMs + 80,
      "pointercancel",
    );
    await settleAt(page, sourceIndex);
  }
  const encodedStrip = await page.evaluate(
    async ({ frames, labels, materials }) => {
      const bitmaps = await Promise.all(
        frames.map(async (encoded) => {
          const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
          return createImageBitmap(new Blob([bytes], { type: "image/png" }));
        }),
      );
      const width = 300;
      const legendHeight = 42;
      const captionHeight = 32;
      const height = Math.round((bitmaps[0]!.height / bitmaps[0]!.width) * width);
      const canvas = document.createElement("canvas");
      canvas.width = width * bitmaps.length;
      canvas.height = height + captionHeight + legendHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The frame-strip canvas could not be created.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "700 15px system-ui, sans-serif";
      for (let index = 0; index < materials.length; index += 1) {
        const material = materials[index]!;
        const x = 14 + index * 190;
        context.fillStyle = material.color;
        context.fillRect(x, 10, 22, 22);
        context.fillStyle = "#111827";
        context.fillText(material.label, x + 30, 27);
      }
      for (let index = 0; index < bitmaps.length; index += 1) {
        const bitmap = bitmaps[index]!;
        context.drawImage(bitmap, index * width, legendHeight + captionHeight, width, height);
        context.fillStyle = "#111827";
        context.font = "700 16px system-ui, sans-serif";
        context.fillText(labels[index]!, index * width + 12, legendHeight + 21);
        bitmap.close();
      }
      return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    },
    {
      frames: encodedFrames,
      labels: stripProgress.map((progress) => `p ${progress.toFixed(2)}`),
      materials: [
        { color: "rgb(220 38 38)", label: "A TEMPLATES" },
        { color: "rgb(37 99 235)", label: "B PROJECT" },
        { color: "rgb(22 163 74)", label: "C MAP" },
        { color: "rgb(234 88 12)", label: "D TEAM" },
        { color: "rgb(88 28 135)", label: "E SETTINGS" },
      ],
    },
  );
  const path = join(artifactDirectory, `${name}-strip.png`);
  await writeFile(path, Buffer.from(encodedStrip, "base64"));
  return path;
}

async function writeTrace(name: string, trace: PileScenarioTrace): Promise<string> {
  const path = join(artifactDirectory, `${name}-trace.json`);
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return path;
}

test("records the cyclic whole-pile physical review set", async ({ page }) => {
  test.setTimeout(360_000);
  await mkdir(artifactDirectory, { recursive: true });
  await openLabDemo(page, "stacked-deck", "no-preference");
  await installHighContrastPileFixture(page);
  await page.evaluate(async () => document.fonts.ready);

  const recordings = {
    shuffleSlowForward: await recordSlowExchange(
      page,
      "shuffle",
      1,
      1,
      "shuffle-slow-forward-pile",
    ),
    shuffleSlowBackward: await recordSlowExchange(
      page,
      "shuffle",
      2,
      -1,
      "shuffle-slow-backward-pile",
    ),
    directSlowForward: await recordSlowExchange(page, "direct", 1, 1, "direct-slow-forward-pile"),
    directSlowBackward: await recordSlowExchange(
      page,
      "direct",
      2,
      -1,
      "direct-slow-backward-pile",
    ),
    directAutonomous: await record(page, "direct-autonomous-pile", async () => {
      await page.getByTestId("stacked-deck-exchange-direct").click();
      await select(page, 2);
      await page.getByTestId("stacked-deck-next").click();
      await settleAt(page, 3);
      await page.getByTestId("stacked-deck-previous").click();
      await settleAt(page, 2);
    }),
    directFastAlternatingWrap: await record(page, "direct-fast-alternating-wrap", async () => {
      await page.getByTestId("stacked-deck-exchange-direct").click();
      await select(page, 4);
      const pitch = await motionPitch(viewport(page));
      for (const [direction, targetIndex] of [
        [1, 0],
        [-1, 4],
        [1, 0],
      ] as const) {
        await fastFlick(page, direction, pitch);
        await waitForAuthority(page, targetIndex);
      }
      await settleAt(page, 0);
    }),
  };

  const reviewScenarios = [
    {
      direction: 1 as const,
      exchange: "shuffle" as const,
      name: "shuffle-slow-forward",
      source: 1,
    },
    {
      direction: -1 as const,
      exchange: "shuffle" as const,
      name: "shuffle-slow-backward",
      source: 2,
    },
    { direction: 1 as const, exchange: "direct" as const, name: "direct-slow-forward", source: 1 },
    {
      direction: -1 as const,
      exchange: "direct" as const,
      name: "direct-slow-backward",
      source: 2,
    },
  ];
  const traces: Record<string, string> = {};
  const strips: Record<string, string> = {};
  for (const scenario of reviewScenarios) {
    const trace = await captureHeldPileScenario(page, {
      direction: scenario.direction,
      exchange: scenario.exchange,
      sourceIndex: scenario.source,
    });
    traces[scenario.name] = await writeTrace(scenario.name, trace);
    strips[scenario.name] = await writeStrip(
      page,
      scenario.exchange,
      scenario.source,
      scenario.direction,
      scenario.name,
    );
  }
  traces.directAutonomousNext = await writeTrace(
    "direct-autonomous-next",
    await captureAutonomousPileScenario(page, {
      direction: 1,
      interactionOrigin: "button",
      sourceIndex: 2,
    }),
  );
  traces.directAutonomousPrevious = await writeTrace(
    "direct-autonomous-previous",
    await captureAutonomousPileScenario(page, {
      direction: -1,
      interactionOrigin: "button",
      sourceIndex: 3,
    }),
  );

  await writeFile(
    join(artifactDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        materials: {
          map: "green",
          project: "blue",
          settings: "purple",
          team: "orange",
          templates: "red",
        },
        recordings,
        revision,
        strips,
        topology: "canonical cyclic ring with a physically occluded folded pile",
        traces,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});
