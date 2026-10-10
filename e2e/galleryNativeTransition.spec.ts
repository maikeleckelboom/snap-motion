import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt } from "./helpers";
import { openPlayground } from "./playgroundHelpers";

interface NativeProbe {
  records: { ready?: boolean; error?: string; source: string[]; destination?: string[] }[];
}

async function sample(page: Page, x: number, y: number) {
  const screenshot = (await page.screenshot({ animations: "allow", scale: "css" })).toString(
    "base64",
  );
  return page.evaluate(
    async ({ encoded, left, top }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.floor(left), Math.floor(top), 1, 1).data].slice(0, 3);
    },
    { encoded: screenshot, left: x, top: y },
  );
}

async function probeNative(page: Page) {
  await page.evaluate(() => {
    const ownerDocument = document;
    const native = ownerDocument.startViewTransition.bind(ownerDocument);
    const state: NativeProbe = { records: [] };
    (window as unknown as { nativeGalleryProbe: NativeProbe }).nativeGalleryProbe = state;
    const endpoints = () =>
      [...ownerDocument.querySelectorAll('[style*="view-transition-name"]')].map(
        (element) => element.getAttribute("data-testid") ?? "",
      );
    document.startViewTransition = ((update: () => void | Promise<void>) => {
      const record: NativeProbe["records"][number] = { source: endpoints() };
      state.records.push(record);
      const transition = native(update);
      void transition.ready.then(
        () => {
          record.ready = true;
          record.destination = endpoints();
          return undefined;
        },
        (error: unknown) => {
          record.error = String(error);
          record.ready = false;
          return undefined;
        },
      );
      return transition;
    }) as typeof document.startViewTransition;
  });
}

for (const duplicateImage of [false, true]) {
  test(`native plates 02 and 06 retain item identity across repeated cycles${duplicateImage ? " with the same image URL" : ""}`, async ({
    page,
  }) => {
    if (duplicateImage) {
      await page.setViewportSize({ width: 390, height: 844 });
      // Supply a duplicate-source fixture to the real component without changing public media.
      await page.route("**/src/playground/gallery-media.ts", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        expect(source).toContain("src: emberDunesUrl");
        await route.fulfill({
          response,
          body: source.replace("src: emberDunesUrl", "src: longRangeUrl"),
        });
      });
    }
    await openPlayground(page, "no-preference");
    test.skip(
      !(await page.evaluate(() => typeof document.startViewTransition === "function")),
      "Browser does not implement native View Transitions",
    );
    if (duplicateImage) {
      await page.getByTestId("media-thumbnail-ember-dunes").scrollIntoViewIfNeeded();
      const sources = await page
        .getByTestId(/^media-thumbnail-image-(long-range|ember-dunes)$/)
        .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
      expect(sources).toHaveLength(2);
      expect(sources[0]).toBe(sources[1]);
    }
    await probeNative(page);
    let index = 0;
    for (const id of ["long-range", "ember-dunes", "long-range", "ember-dunes"]) {
      await page.getByTestId(`media-thumbnail-${id}`).click();
      await expect.poll(async () => (await nativeReady(page, index))?.ready).toBe(true);
      expect(await nativeReady(page, index++)).toMatchObject({
        source: [`media-thumbnail-transition-${id}`],
        destination: [`media-transition-${id}`],
      });
      await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
      await expectCarouselAt(page.getByTestId("media-carousel"), id);
      await expect(page.getByTestId(`media-image-${id}`)).toBeVisible();
      const slideBounds = await page.locator(`[data-slide-id="${id}"]`).boundingBox();
      const viewportBounds = (await page.getByTestId("media-carousel").boundingBox())!;
      expect(Math.abs(slideBounds!.x - viewportBounds.x)).toBeLessThanOrEqual(0.5);
      await page.keyboard.press("Escape");
      await expect.poll(async () => (await nativeReady(page, index))?.ready).toBe(true);
      expect(await nativeReady(page, index++)).toMatchObject({
        source: [`media-transition-${id}`],
        destination: [`media-thumbnail-transition-${id}`],
      });
      await expect(page.getByTestId(`media-thumbnail-${id}`)).toBeFocused();
      await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
    }
  });
}

function freezeNative(page: Page, elapsed: number) {
  return page.addStyleTag({
    content: `
    ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
      animation-play-state: paused !important;
      animation-delay: -${elapsed}ms !important;
    }`,
  });
}

function nativeReady(page: Page, index: number) {
  return page.evaluate(
    (recordIndex) =>
      (window as unknown as { nativeGalleryProbe: NativeProbe }).nativeGalleryProbe.records[
        recordIndex
      ],
    index,
  );
}

for (const returnedId of ["morning-ridge", "moon-over-ridges"]) {
  test(`native Gallery opening and ${returnedId} return retain opaque media and modal paint`, async ({
    page,
  }) => {
    await openPlayground(page, "no-preference");
    const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
    test.skip(!supported, "Browser does not implement native View Transitions");
    await probeNative(page);
    const thumbnail = page.getByTestId(`media-thumbnail-transition-${returnedId}`);
    await thumbnail.scrollIntoViewIfNeeded();
    const box = (await thumbnail.boundingBox())!;
    const reference = await sample(page, box.x + box.width / 2, box.y + box.height * 0.2);
    let frozen = await freezeNative(page, 140);
    await page.getByTestId("media-thumbnail-morning-ridge").click();
    await expect.poll(async () => (await nativeReady(page, 0))?.ready).toBe(true);
    expect(await sample(page, 20, 200)).toEqual([13, 12, 10]);
    await frozen.evaluate((element) => element.remove());
    await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
    if (returnedId !== "morning-ridge") {
      for (const id of ["long-range", returnedId]) {
        await page.getByTestId("media-next").click();
        await expectCarouselAt(page.getByTestId("media-carousel"), id);
      }
    }
    frozen = await freezeNative(page, 140);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await nativeReady(page, 1))?.ready).toBe(true);
    const point = await page.evaluate(() => {
      const style = getComputedStyle(
        document.documentElement,
        "::view-transition-group(media-inspection-media)",
      );
      const matrix = new DOMMatrix(style.transform);
      return {
        x: matrix.e + parseFloat(style.width) / 2,
        y: matrix.f + parseFloat(style.height) * 0.2,
      };
    });
    const moving = await sample(page, point.x, point.y);
    for (let channel = 0; channel < 3; channel += 1)
      expect(Math.abs(moving[channel]! - reference[channel]!)).toBeLessThanOrEqual(6);
    await frozen.evaluate((element) => element.remove());
    await expect(page.getByTestId(`media-thumbnail-${returnedId}`)).toBeFocused();
    await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
  });
}

test("native zoomed closure preserves the visible crop without spilling over the page", async ({
  page,
}) => {
  await openPlayground(page, "no-preference");
  const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
  test.skip(!supported, "Browser does not implement native View Transitions");
  const pageColour = await sample(page, 10, 200);
  await probeNative(page);
  await page.getByTestId("media-thumbnail-morning-ridge").click();
  await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
  for (let step = 0; step < 2; step++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const transform = page.getByTestId("media-transform-morning-ridge");
  await expect(transform).toHaveCSS("will-change", "auto");
  await page.getByTestId("media-carousel").focus();
  await page.keyboard.press("ArrowRight");
  await expect(transform).toHaveCSS("will-change", "auto");
  const box = (await page.getByTestId("media-frame-morning-ridge").boundingBox())!;
  const point = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 };
  const crop = await sample(page, point.x, point.y);
  const frozen = await freezeNative(page, 0);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await nativeReady(page, 1))?.ready).toBe(true);
  expect(await sample(page, 10, 200)).toEqual(pageColour);
  const closingCrop = await sample(page, point.x, point.y);
  for (let channel = 0; channel < 3; channel++)
    expect(Math.abs(closingCrop[channel]! - crop[channel]!)).toBeLessThanOrEqual(2);
  await frozen.evaluate((element) => element.remove());
  await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
  await page.getByTestId("media-thumbnail-morning-ridge").click();
  await expect(page.getByTestId("media-carousel")).toHaveAttribute(
    "data-transform-state",
    "fitted",
  );
});
