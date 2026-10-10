import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";
import { openPlayground } from "./playgroundHelpers";

interface Endpoint {
  id: string | null;
  transform: string;
  source: string | undefined;
}
interface Capture {
  before: Endpoint[];
  after: Endpoint[];
  scrollBefore: number;
  scrollAfter: number;
}

async function instrument(page: Page, supported = true) {
  await page.addInitScript((apiSupported) => {
    const state = {
      captures: [] as Capture[],
      fail: false,
      holdFinish: false,
      releases: [] as (() => void)[],
    };
    (window as unknown as { transitionProbe: typeof state }).transitionProbe = state;
    const transitionName = "media-inspection-media";
    const endpoints = () =>
      [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')]
        .filter(
          (element) => element.style.getPropertyValue("view-transition-name") === transitionName,
        )
        .map((element) => ({
          id: element.getAttribute("data-testid"),
          transform: getComputedStyle(
            element.closest(".media-transform-surface") ??
              element.querySelector(".media-transform-surface") ??
              element,
          ).transform,
          source: element.querySelector<HTMLImageElement>("img")?.currentSrc,
        }));
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: apiSupported
        ? (update: () => Promise<void> | void) => {
            if (state.fail) throw new Error("Intentional transition setup failure");
            const capture = {
              before: endpoints(),
              after: [] as Endpoint[],
              scrollBefore: scrollY,
              scrollAfter: scrollY,
            };
            state.captures.push(capture);
            const finished = Promise.resolve()
              .then(update)
              .then(async () => {
                capture.after = endpoints();
                capture.scrollAfter = scrollY;
                if (state.holdFinish)
                  await new Promise<void>((resolve) => state.releases.push(resolve));
                return undefined;
              });
            return { finished, ready: finished, skipTransition() {} };
          }
        : undefined,
    });
  }, supported);
}

async function captures(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { transitionProbe: { captures: Capture[] } }).transitionProbe.captures,
  );
}

async function open(page: Page, presentation: "public" | "lab", id?: string) {
  if (presentation === "public") await openPlayground(page, "no-preference");
  else await openLabDemo(page, "media", "no-preference");
  await page.getByTestId(id ? `media-thumbnail-${id}` : "open-lightbox").click();
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".media-frame")
        .evaluateAll((elements) =>
          elements.every((element) => element.getAttribute("data-media-state") === "loaded"),
        ),
    )
    .toBe(true);
}

async function navigate(page: Page, id: string, direction: "next" | "previous" = "next") {
  await page.getByTestId(`media-${direction}`).click();
  await expectCarouselAt(page.getByTestId("media-carousel"), id);
}

async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
  await expect.poll(() => page.locator('[style*="view-transition-name"]').count()).toBe(0);
}

for (const scenario of [
  { from: "morning-ridge", path: [] },
  { from: "morning-ridge", path: ["long-range"] },
  { from: "morning-ridge", path: ["long-range", "moon-over-ridges"] },
  { from: "moon-over-ridges", path: ["long-range"], direction: "previous" as const },
]) {
  test(`${scenario.from} via ${scenario.path.join(" / ") || "itself"} returns the actual displayed identity`, async ({
    page,
  }) => {
    await instrument(page);
    await open(page, "public", scenario.from);
    for (const id of scenario.path) await navigate(page, id, scenario.direction ?? "next");
    const current = scenario.path.at(-1) ?? scenario.from;
    await close(page);
    await expect(page.getByTestId(`media-thumbnail-${current}`)).toBeFocused();
    const records = await captures(page);
    expect(records[0]!.before.map((value) => value.id)).toEqual([
      `media-thumbnail-transition-${scenario.from}`,
    ]);
    expect(records[0]!.after.map((value) => value.id)).toEqual([
      `media-transition-${scenario.from}`,
    ]);
    expect(records.at(-1)!.before.map((value) => value.id)).toEqual([
      `media-transition-${current}`,
    ]);
    expect(records.at(-1)!.after.map((value) => value.id)).toEqual([
      `media-thumbnail-transition-${current}`,
    ]);
    expect(records.at(-1)!.before[0]!.source).toBe(records.at(-1)!.after[0]!.source);
  });
}

test("Lab navigation and general-button focus use independent visual and focus destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await instrument(page);
  await open(page, "lab");
  await navigate(page, "extremely-wide");
  await navigate(page, "extremely-tall");
  await close(page);
  const records = await captures(page);
  expect(records.at(-1)!.before[0]!.id).toBe("media-transition-extremely-tall");
  expect(records.at(-1)!.after[0]!.id).toBe("media-thumbnail-transition-extremely-tall");
  await expect(page.getByTestId("open-lightbox")).toBeFocused();
});

for (const elapsed of [0, 80]) {
  test(`close ${elapsed}ms into navigation uses rendered identity or an unambiguous fallback`, async ({
    page,
  }) => {
    await page.clock.install();
    await instrument(page);
    await open(page, "public", "morning-ridge");
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.getByTestId("media-next").dispatchEvent("click");
    await page.clock.runFor(elapsed);
    await page.getByTestId("close-lightbox").dispatchEvent("click");
    await page.clock.runFor(32);
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
    const records = await captures(page);
    if (elapsed === 0) expect(records.at(-1)!.before[0]!.id).toBe("media-transition-morning-ridge");
    else expect(records).toHaveLength(1);
  });
}

test("zoom and pan are captured before reset and reopening starts fitted", async ({ page }) => {
  await instrument(page);
  await open(page, "public", "morning-ridge");
  const stage = page.getByTestId("media-carousel");
  await stage.dblclick();
  await expect(stage).toHaveAttribute("data-transform-state", "zoomed");
  await expect(page.getByTestId("media-transform-morning-ridge")).toHaveCSS("will-change", "auto");
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("media-transform-morning-ridge")).toHaveCSS("will-change", "auto");
  const transform = await page
    .getByTestId("media-transform-morning-ridge")
    .evaluate((element) => getComputedStyle(element).transform);
  await close(page);
  expect((await captures(page)).at(-1)!.before[0]!.id).toBe("media-frame-morning-ridge");
  expect((await captures(page)).at(-1)!.before[0]!.transform).toBe(transform);
  await page.getByTestId("media-thumbnail-morning-ridge").click();
  await expect(stage).toHaveAttribute("data-transform-state", "fitted");
});

test("a fully offscreen mobile thumbnail is minimally revealed at the capture commit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await instrument(page);
  await open(page, "public", "morning-ridge");
  for (const id of ["long-range", "moon-over-ridges", "high-pass", "salt-flat-dusk", "ember-dunes"])
    await navigate(page, id);
  const thumbnail = page.getByTestId("media-thumbnail-ember-dunes");
  // Force the actual matching lazy image into the cache while keeping document position fixed.
  await thumbnail.locator("img").evaluate(async (image: HTMLImageElement) => {
    image.loading = "eager";
    await image.decode();
  });
  await expect.poll(() => thumbnail.boundingBox().then((box) => box?.y ?? 0)).toBeGreaterThan(400);
  await close(page);
  const record = (await captures(page)).at(-1)!;
  expect(record.before[0]!.id).toBe("media-transition-ember-dunes");
  expect(record.after[0]!.id).toBe("media-thumbnail-transition-ember-dunes");
  expect(record.scrollAfter).toBeGreaterThan(record.scrollBefore);
  await expect(thumbnail).toBeFocused();
  expect((await thumbnail.boundingBox())!.y).toBeLessThan(400);
});

for (const unavailable of ["removed", "hidden", "undecoded"] as const) {
  test(`${unavailable} thumbnail closes normally without false endpoint ownership`, async ({
    page,
  }) => {
    await instrument(page);
    await open(page, "public", "morning-ridge");
    await navigate(page, "long-range");
    await page.getByTestId("media-thumbnail-long-range").evaluate((element, mode) => {
      if (mode === "removed") element.remove();
      else if (mode === "hidden") (element as HTMLElement).hidden = true;
      else element.querySelector("img")!.src = "data:image/png;base64,broken";
    }, unavailable);
    await close(page);
    expect(await captures(page)).toHaveLength(1);
    await expect(
      page.getByTestId(
        unavailable === "undecoded"
          ? "media-thumbnail-long-range"
          : "media-thumbnail-morning-ridge",
      ),
    ).toBeFocused();
  });
}

for (const mode of ["reduced", "unsupported"] as const) {
  test(`${mode} returns active-item focus through the normal native close`, async ({ page }) => {
    await instrument(page, mode !== "unsupported");
    if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlayground(page, mode === "reduced" ? "reduce" : "no-preference");
    await page.getByTestId("media-thumbnail-morning-ridge").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await navigate(page, "long-range");
    await close(page);
    expect(await captures(page)).toHaveLength(0);
    await expect(page.getByTestId("media-thumbnail-long-range")).toBeFocused();
  });
}

test("transition setup failure still closes and cleans names across repeated cycles", async ({
  page,
}) => {
  await instrument(page);
  await open(page, "public", "morning-ridge");
  await page.evaluate(() => {
    (window as unknown as { transitionProbe: { fail: boolean } }).transitionProbe.fail = true;
  });
  for (let cycle = 0; cycle < 3; cycle++) {
    await close(page);
    await expect(page.getByTestId("media-thumbnail-morning-ridge")).toBeFocused();
    await page.getByTestId("media-thumbnail-morning-ridge").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
  }
});

test("a stale closing transition cannot clean names or focus belonging to a reopened lifecycle", async ({
  page,
}) => {
  await instrument(page);
  await open(page, "public", "morning-ridge");
  await page.evaluate(() => {
    (window as unknown as { transitionProbe: { holdFinish: boolean } }).transitionProbe.holdFinish =
      true;
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
  await page.getByTestId("media-thumbnail-long-range").click();
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
  await expect(page.getByTestId("media-transition-long-range")).toHaveCSS(
    "view-transition-name",
    "media-inspection-media",
  );
  await page.evaluate(() => {
    const probe = (
      window as unknown as { transitionProbe: { holdFinish: boolean; releases: (() => void)[] } }
    ).transitionProbe;
    probe.holdFinish = false;
    for (const release of probe.releases.splice(0)) release();
  });
  await expect.poll(() => page.locator('[style*="view-transition-name"]').count()).toBe(0);
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
  await close(page);
  await expect(page.getByTestId("media-thumbnail-long-range")).toBeFocused();
});

test("a partially visible thumbnail remains a return destination without scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await instrument(page);
  await open(page, "public", "morning-ridge");
  await close(page);
  await page.getByTestId("media-thumbnail-morning-ridge").evaluate((element) => {
    window.scrollBy({
      top: element.getBoundingClientRect().top - innerHeight + 25,
      behavior: "instant",
    });
    (element as HTMLElement).click();
  });
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
  await close(page);
  const record = (await captures(page)).at(-1)!;
  expect(record.after[0]!.id).toBe("media-thumbnail-transition-morning-ridge");
  expect(record.scrollAfter).toBe(record.scrollBefore);
});

test("general-button opening preserves document position when the visual destination is offscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await instrument(page);
  await open(page, "lab");
  for (const id of ["extremely-wide", "extremely-tall", "transformed", "delayed"])
    await navigate(page, id);
  const thumbnail = page.getByTestId("media-thumbnail-delayed");
  expect((await thumbnail.boundingBox())!.y).toBeGreaterThan(500);
  const before = await page.evaluate(() => scrollY);
  await close(page);
  expect(await captures(page)).toHaveLength(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await expect(page.getByTestId("open-lightbox")).toBeFocused();
});

for (const state of ["pending", "failed"] as const) {
  test(`${state} displayed media uses native closure without an invented transition source`, async ({
    page,
  }) => {
    await instrument(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/media-fixtures/regular.svg", async (route) => {
      if (state === "pending") await gate;
      if (state === "failed")
        await route.fulfill({ contentType: "image/png", body: "invalid image bytes" });
      else await route.continue();
    });
    // The intentionally pending thumbnail must not hold page.goto's load-event readiness hostage.
    await page.goto("./?demo=media&view=workbench", { waitUntil: "domcontentloaded" });
    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
    await expect(page.locator("#panel-media")).toBeVisible();
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expect(page.getByTestId("media-image-regular")).toHaveAttribute(
      "data-media-state",
      state,
    );
    await close(page);
    expect(await captures(page)).toHaveLength(0);
    await expect(page.getByTestId("open-lightbox")).toBeFocused();
    release();
  });
}
