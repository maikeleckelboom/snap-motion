import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";
import {
  beginPointer,
  finishPointerBy,
  motionPitch,
  movePointerBy,
  viewport,
} from "./stackedDeckHarness";
import {
  expectDirectTraceCoherent,
  startDirectRafTrace,
  stopDirectRafTrace,
  type DirectRafTraceFrame,
  type DirectRafTraceShell,
} from "./stackedDeckTrace";

function shell(id: string, layer: number): DirectRafTraceShell {
  return {
    bottom: 50,
    computedTransform: "matrix(1, 0, 0, 1, -50, -50)",
    elapsed: Number.NaN,
    id,
    identity: id === "a" ? 1 : 2,
    index: id === "a" ? 0 : 1,
    interactive: false,
    landingOrder: Number.NaN,
    layer,
    left: -50,
    opacity: 1,
    expectedComputedTransform: "matrix(1, 0, 0, 1, -50, -50)",
    polygon: [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 },
    ],
    published: { layer, rotate: 0, scale: 1, translateX: 0, translateY: 0 },
    releaseX: Number.NaN,
    releaseY: Number.NaN,
    right: 50,
    role: "top",
    rotate: 0,
    scale: 1,
    settlement: Number.NaN,
    top: -50,
    translateX: 0,
    translateY: 0,
    updatedAt: Number.NaN,
    visible: true,
  };
}

function frame(
  shells: readonly DirectRafTraceShell[],
  revision: number,
  owner = "a",
): DirectRafTraceFrame {
  return {
    authoritativeIndex: 0,
    directDirection: 1,
    directOriginIndex: 0,
    directReleaseX: 0,
    directReleaseY: 0,
    directPhase: "held",
    directSettlement: 0,
    directSignedTravel: 0,
    directTargetIndex: 1,
    frame: revision,
    landingCount: shells.filter((body) => Number.isFinite(body.settlement)).length,
    painted: { center: owner, left: owner, right: owner },
    paintedX: { center: 0, left: -25, right: 25 },
    paintedY: 0,
    revision,
    sampledAt: revision * 230,
    shells,
    snapshotFrozen: true,
    source: "publication",
    timestamp: revision * 230,
  };
}

test("Direct trace rejects premature retirement even when a skipped sample permits enough time", () => {
  const unfinished = {
    ...shell("a", 501),
    elapsed: 0.5,
    landingOrder: 1,
    settlement: 0.5,
    updatedAt: 0,
  };
  const before = frame([unfinished], 0);
  const absent = frame([shell("a", 501)], 1);
  // This is exactly the 21cbc01 acceptance bound. Time could have elapsed, but no arrival was seen.
  expect(
    unfinished.elapsed + (absent.timestamp - unfinished.updatedAt) / 230,
  ).toBeGreaterThanOrEqual(1);
  expect(() => expectDirectTraceCoherent([before, absent])).toThrow(/without an observed arrival/);
  const arrived = frame([{ ...unfinished, elapsed: 1, settlement: 1 }], 1);
  expect(
    expectDirectTraceCoherent([before, arrived, { ...absent, revision: 2 }]).maximumLandingCount,
  ).toBe(1);
});

test("Direct trace rejects inconsistent snapshots and an overlapping paint swap", () => {
  const before = frame([shell("a", 501), shell("b", 500)], 0);
  const mixed = frame(
    [{ ...shell("a", 501), computedTransform: "matrix(1, 0, 0, 1, -10, -50)" }, shell("b", 500)],
    1,
  );
  expect(() => expectDirectTraceCoherent([before, mixed])).toThrow(/computed transform mismatch/);
  const wrongPaint = frame([shell("a", 500), shell("b", 501)], 1, "b");
  expect(() => expectDirectTraceCoherent([before, wrongPaint])).toThrow(
    /without a body-edge crossing/,
  );
});

test("Direct trace reports moving handoffs whose intermediate clearance was not sampled", () => {
  const before = frame([shell("a", 501), shell("b", 500)], 0);
  const moved = shell("a", 500);
  const after = frame(
    [
      {
        ...moved,
        computedTransform: "matrix(1, 0, 0, 1, -49, -50)",
        expectedComputedTransform: "matrix(1, 0, 0, 1, -49, -50)",
        polygon: moved.polygon.map((point) => ({ x: point.x + 1, y: point.y })),
        published: { ...moved.published, translateX: 1 },
        translateX: 1,
      },
      shell("b", 501),
    ],
    1,
    "b",
  );
  const review = expectDirectTraceCoherent([before, after]);
  expect(review.unobservedPaintHandoffs).toHaveLength(3);
  expect(review.unobservedPaintHandoffs[0]).toMatchObject({
    beforeOwner: "a",
    afterOwner: "b",
    beforeRevision: 0,
    afterRevision: 1,
  });
});

test("Direct trace records the actual RAF microtask order in both callback schedules", async ({
  page,
}) => {
  const schedules = await page.evaluate(async () => {
    const result: Array<{ order: string; observations: string[] }> = [];
    for (const order of ["before", "after"]) {
      const observations: string[] = [];
      let state = 0;
      const recorder = () => {
        observations.push(`recorder:${state}`);
        queueMicrotask(() => queueMicrotask(() => observations.push(`sample:${state}`)));
      };
      const updater = () => {
        state = 1;
        observations.push(`update:${state}`);
        queueMicrotask(() => observations.push(`flush:${state}`));
      };
      requestAnimationFrame(order === "before" ? recorder : updater);
      requestAnimationFrame(order === "before" ? updater : recorder);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => queueMicrotask(resolve));
      });
      result.push({ order, observations });
    }
    return result;
  });
  expect(schedules).toEqual([
    { order: "before", observations: ["recorder:0", "sample:0", "update:1", "flush:1"] },
    { order: "after", observations: ["update:1", "flush:1", "recorder:1", "sample:1"] },
  ]);
});

async function prepare(page: Page) {
  await openLabDemo(page, "stacked-deck", "no-preference");
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await expectCarouselAt(viewport(page), "map");
}

test("Direct trace sees inert visible bodies and rejects a temporary computed-style mutation", async ({
  page,
}) => {
  await prepare(page);
  const stage = viewport(page);
  await startDirectRafTrace(page);
  const hand = await beginPointer(stage);
  await movePointerBy(page, hand, -(await motionPitch(stage)) * 0.2, 0, 100);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const trace = await stopDirectRafTrace(page);
  const held = trace.filter(
    (sample) => sample.directPhase === "held" && sample.directSignedTravel > 0,
  );
  expect(held.length).toBeGreaterThan(0);
  expect(held.every((sample) => sample.shells.every((body) => !body.interactive))).toBe(true);
  expect(held.every((sample) => sample.painted.center !== "")).toBe(true);
  expectDirectTraceCoherent(trace);

  await startDirectRafTrace(page);
  await stage.evaluate((root) => {
    const card = root.querySelector<HTMLElement>("[data-item-id='map']")!;
    const previous = card.style.zIndex;
    try {
      card.style.zIndex = "9999";
      // The diagnostic remains untouched. Sampling computed style must detect the contradiction.
      root.dispatchEvent(new Event("snap-motion-direct-frame"));
    } finally {
      card.style.zIndex = previous;
    }
  });
  const mutated = await stopDirectRafTrace(page);
  expect(() => expectDirectTraceCoherent(mutated)).toThrow(/computed paint rank disagrees/);
  await finishPointerBy(page, hand, 0, 0, 200, "pointercancel");
});

/** Real DOM/Vue rendering on a manually advanced clock, with a microtask checkpoint per callback. */
async function installClock(page: Page) {
  await page.addInitScript(() => {
    const nativeRaf = requestAnimationFrame.bind(window);
    const nativeCancel = cancelAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    const pending = new Map<number, { callback: FrameRequestCallback; native: number }>();
    let handle = 0;
    let manual = false;
    let now = 0;
    window.requestAnimationFrame = (callback) => {
      const id = ++handle;
      const entry = { callback, native: 0 };
      pending.set(id, entry);
      if (!manual) {
        entry.native = nativeRaf((timestamp) => {
          if (!pending.delete(id)) return;
          callback(timestamp);
        });
      }
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const entry = pending.get(id);
      if (entry !== undefined) nativeCancel(entry.native);
      pending.delete(id);
    };
    const clock = {
      start() {
        now = realNow();
        manual = true;
        for (const entry of pending.values()) nativeCancel(entry.native);
        performance.now = () => now;
      },
      async step(delta: number, recorderFirst: boolean) {
        now += delta;
        const callbacks = [...pending.entries()].toSorted(([, first], [, second]) => {
          const difference =
            Number(first.callback.name === "record") - Number(second.callback.name === "record");
          return recorderFirst ? -difference : difference;
        });
        for (const [id, entry] of callbacks) {
          if (!pending.delete(id)) continue;
          entry.callback(now);
          // A posted task runs only after this callback's complete microtask queue has drained.
          // This is a deterministic callback/DOM-flush probe, not a compositor or paint clock.
          await new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.addEventListener(
              "message",
              () => {
                channel.port1.close();
                channel.port2.close();
                resolve();
              },
              { once: true },
            );
            channel.port1.start();
            channel.port2.postMessage(null);
          });
        }
      },
    };
    Object.assign(window, { snapMotionTraceClock: clock });
  });
}

function observablePose(body: DirectRafTraceShell) {
  return {
    identity: body.identity,
    layer: body.layer,
    polygon: body.polygon,
    rotate: body.rotate,
    scale: body.scale,
    translateX: body.translateX,
    translateY: body.translateY,
  };
}

for (const recorderFirst of [true, false]) {
  test(`Direct trace preserves exact arrival with ${recorderFirst ? "early" : "late"} recorder, skipped samples and a delayed frame`, async ({
    page,
  }, testInfo) => {
    await installClock(page);
    await prepare(page);
    await page.evaluate(() => {
      (
        window as typeof window & { snapMotionTraceClock: { start: () => void } }
      ).snapMotionTraceClock.start();
    });
    await startDirectRafTrace(page, 4);
    const seed = recorderFirst ? 104729 : 130363;
    let random = seed;
    const deltas: number[] = [];
    const step = async (delay?: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const delta = delay ?? 12 + (random % 9);
      deltas.push(delta);
      await page.evaluate(
        async ({ delta: advance, recorderFirst: beforeUpdater }) => {
          await (
            window as typeof window & {
              snapMotionTraceClock: {
                step: (delta: number, recorderFirst: boolean) => Promise<void>;
              };
            }
          ).snapMotionTraceClock.step(advance, beforeUpdater);
        },
        { delta, recorderFirst },
      );
    };
    const stage = viewport(page);
    const pitch = await motionPitch(stage);
    for (const [origin, target] of [
      ["map", "team"],
      ["team", "settings"],
    ]) {
      const card = stage.locator(`[data-item-id='${origin}']`);
      const hand = await beginPointer(card);
      await movePointerBy(page, hand, -pitch * 0.8, 80, 80);
      await step();
      await finishPointerBy(page, hand, -pitch * 0.8, 80, 120, "pointerup");
      let offered = false;
      for (let tick = 0; tick < 10; tick += 1) {
        await step();
        if (
          (await stage
            .locator(`[data-item-id='${target}']`)
            .getAttribute("data-deck-interactive")) === "true"
        ) {
          offered = true;
          break;
        }
      }
      expect(offered, `${target} was never offered on the bounded frame clock`).toBe(true);
    }
    const hand = await beginPointer(stage.locator("[data-item-id='settings']"));
    await movePointerBy(page, hand, -pitch * 0.3, 100, 160);
    await step();
    await step(120);
    await step(250);
    await step();
    const trace = await stopDirectRafTrace(page);
    const artifactDirectory = join(
      import.meta.dirname,
      "..",
      ".artifacts",
      "stacked-deck-multi-landing",
    );
    const evidence = JSON.stringify({ seed, deltas, recorderFirst, trace }, null, 2);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(
      join(
        artifactDirectory,
        `publication-clock-${testInfo.project.name}-${seed}-${testInfo.repeatEachIndex}.json`,
      ),
      `${evidence}\n`,
    );
    await testInfo.attach("direct-publication-clock", {
      body: Buffer.from(evidence),
      contentType: "application/json",
    });
    expect(expectDirectTraceCoherent(trace).maximumLandingCount).toBeGreaterThanOrEqual(2);
    const publicationCount = trace.filter((sample) => sample.source === "publication").length;
    const rafSamples = trace.filter((sample) => sample.source === "raf");
    expect(publicationCount).toBeGreaterThan(rafSamples.length);
    expect(rafSamples.length).toBeGreaterThan(0);
    expect(
      recorderFirst
        ? rafSamples.every((sample) => sample.timestamp < sample.sampledAt)
        : rafSamples.some((sample) => sample.timestamp === sample.sampledAt),
      "the integrated recorder did not exercise the requested callback ordering",
    ).toBe(true);
    const retirements = trace.flatMap((current, index) =>
      index === 0
        ? []
        : trace[index - 1]!.shells.filter(
            (previous) =>
              Number.isFinite(previous.landingOrder) &&
              !current.shells.some((body) => body.landingOrder === previous.landingOrder),
          ),
    );
    expect(retirements.length).toBeGreaterThanOrEqual(2);
    expect(retirements.every((body) => body.elapsed === 1 && body.settlement === 1)).toBe(true);
    for (const [index, current] of trace.entries()) {
      if (index === 0) continue;
      const previous = trace[index - 1]!;
      if (current.landingCount >= previous.landingCount) continue;
      // The pointer and scalar deck are stationary here. Retirement must preserve every actual
      // transformed body and its computed paint rank, not merely the diagnostic elapsed value.
      expect(current.shells.map(observablePose)).toEqual(previous.shells.map(observablePose));
    }
    const missingArrival = trace.filter((sample) =>
      sample.shells.every((body) => body.elapsed !== 1),
    );
    expect(() => expectDirectTraceCoherent(missingArrival)).toThrow(
      /without an observed arrival|not sampled/,
    );
    await finishPointerBy(page, hand, -pitch * 0.3, 100, 240, "pointercancel");
  });
}
