import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, type Browser, type Page } from "@playwright/test";

interface RenderNode {
  readonly tag: string;
  readonly class?: string;
  readonly style?: Record<string, string | number>;
  readonly attributes: Record<string, unknown>;
}
interface HydrationProbe {
  readonly surface: string;
  readonly serverDom: string;
  readonly firstRender: readonly RenderNode[];
}

async function expectSelection(page: Page, id: string) {
  const rail = page.locator(".snap-motion-coverflow");
  await expect(rail).toHaveAttribute("data-active-id", id);
  await expect(rail).toHaveAttribute("data-visual-id", id);
  await expect(rail).toHaveAttribute("data-settled-id", id);
  await expect(rail).toHaveAttribute("data-phase", "idle");
  const current = rail.locator('[data-snap-motion-item][data-active="true"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("data-item-id", id);
  await expect(current).toHaveAttribute("data-visual", "true");
  await expect(current).toHaveAttribute("data-settled", "true");
}

/** A direct image slot occupies the physical panel without package or fixture chrome. */
export async function certifyCoverflowImagePanels(page: Page) {
  const cards = page.locator(".snap-motion-coverflow-card");
  await expect(cards).toHaveCount(3);
  await expect
    .poll(() =>
      cards
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  const panels = await cards.evaluateAll((elements) => {
    const view = elements[0]!.ownerDocument.defaultView!;
    function material(element: Element) {
      const style = view.getComputedStyle(element);
      return {
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        border: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        radius: [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ],
        shadow: style.boxShadow,
        clip: style.clipPath,
      };
    }
    return elements.map((element) => {
      const card = element as HTMLElement;
      const image = card.querySelector("img")!;
      const fitScale = Math.min(
        image.clientWidth / image.naturalWidth,
        image.clientHeight / image.naturalHeight,
      );
      return {
        id: card.dataset.itemId,
        children: [...card.children].map((child) => child.tagName),
        shellMaterial: material(card),
        imageMaterial: material(image),
        shellOverflow: getComputedStyle(card).overflow,
        shellTransform: getComputedStyle(card).transform,
        imageTransform: getComputedStyle(image).transform,
        shellSize: [card.clientWidth, card.clientHeight],
        imageSize: [image.clientWidth, image.clientHeight],
        imageOffset: [image.offsetLeft, image.offsetTop],
        paintedInset: [
          (image.clientWidth - image.naturalWidth * fitScale) / 2,
          (image.clientHeight - image.naturalHeight * fitScale) / 2,
        ],
        pseudoContent: [
          getComputedStyle(card, "::before").content,
          getComputedStyle(card, "::after").content,
        ],
      };
    });
  });
  const neutral = {
    background: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    border: ["0px", "0px", "0px", "0px"],
    padding: ["0px", "0px", "0px", "0px"],
    radius: ["0px", "0px", "0px", "0px"],
    shadow: "none",
    clip: "none",
  };
  for (const panel of panels) {
    expect(panel.children).toEqual(["IMG"]);
    expect(panel.shellMaterial).toEqual(neutral);
    expect(panel.imageMaterial).toEqual(neutral);
    expect(panel.shellOverflow).toBe("visible");
    expect(panel.shellTransform).not.toBe("none");
    expect(panel.imageTransform).toBe("none");
    expect(panel.imageSize).toEqual(panel.shellSize);
    expect(panel.imageOffset).toEqual([0, 0]);
    // The package rounds card height to CSS pixels; matching artwork must not add a visible mat.
    for (const inset of panel.paintedInset) expect(inset).toBeLessThanOrEqual(0.5);
    for (const content of panel.pseudoContent) expect(["none", "normal"]).toContain(content);
  }
  return panels;
}

export async function certifySurfaceFocus(page: Page, directory?: string): Promise<void> {
  for (const selector of [
    ".snap-motion-coverflow",
    ".snap-motion-stacked-deck",
    ".snap-motion-carousel-viewport",
  ]) {
    const surface = page.locator(selector);
    await expect(surface).toHaveAttribute("tabindex", "0");
    // A tap can deliberately leave focus outside the surface. Tab must still show its ring.
    await surface.click();
    await page.keyboard.press("Tab");
    for (
      let step = 0;
      step < 20 && !(await surface.evaluate((element) => element === document.activeElement));
      step++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(surface).toBeFocused();
    await expect(surface).toHaveCSS("outline-style", "solid");
    // Return focus outside before proving the package's completed-swipe focus transfer.
    await page.keyboard.press("Tab");
    await surface.scrollIntoViewIfNeeded();
    const box = (await surface.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 8 });
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    // Carousel does not transfer focus on release; test its public focusable viewport in the
    // same pointer modality. Coverflow and Deck must transfer focus themselves after a swipe.
    if (selector.includes("carousel-viewport")) {
      await surface.focus();
    }
    await expect(surface).toBeFocused();
    await expect(surface).not.toHaveCSS("outline-style", "solid");
    await expect(surface).toHaveCSS("outline-style", "none");

    // The first keyboard operation after pointer focus must make the indicator visible too.
    await page.keyboard.press("ArrowLeft");
    await expect(surface).toHaveCSS("outline-style", "solid");
    await expect(surface).toHaveAttribute("data-phase", "idle");

    // Leave and return with real keyboard input; programmatic focus cannot prove input modality.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(surface).toBeFocused();
    expect(await surface.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(surface).toHaveCSS("outline-style", "solid");
    await expect(surface).toHaveCSS("outline-width", "2px");
    await expect(surface).toHaveCSS("outline-offset", "2px");
    if (directory)
      await surface.screenshot({
        path: resolve(directory, `${selector.slice(1)}-keyboard-focus.png`),
      });
    await expect(surface).toHaveAttribute("data-phase", "idle");
    if (selector.includes("carousel-viewport")) {
      await page.keyboard.press("ArrowLeft");
      await expect(surface.locator('[data-slide-id="one"]')).not.toHaveAttribute("inert");
    } else {
      const before = await surface.getAttribute("data-active-id");
      await page.keyboard.press(before === "team" ? "ArrowLeft" : "ArrowRight");
      await expect(surface).not.toHaveAttribute("data-active-id", before!);
    }
    await expect(surface).toBeFocused();

    await surface.evaluate((element) => {
      (element as HTMLElement).style.setProperty("--snap-motion-focus-width", "3px");
      (element as HTMLElement).style.setProperty("--snap-motion-focus-color", "rgb(90, 40, 180)");
    });
    await expect(surface).toHaveCSS("outline-width", "3px");
    await expect(surface).toHaveCSS("outline-color", "rgb(90, 40, 180)");
    await page.emulateMedia({ forcedColors: "active" });
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    await expect(surface).toHaveCSS("outline-style", "solid");
    await expect(surface).toHaveCSS("outline-width", "3px");
    const colors = await surface.evaluate((element) => {
      const canvas = document.createElement("span");
      canvas.style.color = "Canvas";
      document.body.append(canvas);
      const background = getComputedStyle(canvas).color;
      canvas.remove();
      return { outline: getComputedStyle(element).outlineColor, background };
    });
    expect(colors.outline).not.toBe("rgba(0, 0, 0, 0)");
    expect(colors.outline).not.toBe(colors.background);
    if (directory)
      await surface.screenshot({
        path: resolve(directory, `${selector.slice(1)}-forced-colors-focus.png`),
      });
    await page.emulateMedia({ forcedColors: "none" });
  }
}

async function certifyWideInteraction(page: Page) {
  const rail = page.locator(".snap-motion-coverflow");
  await rail.focus();
  await page.keyboard.press("ArrowRight");
  await expectSelection(page, "team");
  await expect(rail).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expectSelection(page, "project");
  const box = (await rail.boundingBox())!;
  const pitch = Number(await rail.getAttribute("data-pitch"));
  const initial = Number(await rail.getAttribute("data-position"));
  const distance = Math.round(pitch * 0.7);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - distance, box.y + box.height / 2, { steps: 8 });
  await expect(rail).toHaveAttribute("data-phase", "dragging");
  expect(Number(await rail.getAttribute("data-position")) - initial).toBeCloseTo(-distance, 3);
  await expect(rail).toHaveAttribute("data-active-id", "project");
  await page.mouse.up();
  await expectSelection(page, "team");
  await expect(rail).toHaveCSS("outline-style", "none");
  await rail.hover();
  await page.mouse.wheel(-pitch * 0.8, 0);
  await expectSelection(page, "project");
  await page.getByRole("button", { name: "Toggle controlled", exact: true }).click();
  await expect(page.locator("[data-preference-state]")).toHaveAttribute("data-controlled", "true");
  await rail.focus();
  await page.keyboard.press("ArrowRight");
  await expectSelection(page, "team");
  await page.getByRole("button", { name: "Reverse collection", exact: true }).click();
  await expectSelection(page, "team");
  await page.getByRole("button", { name: "Toggle controlled", exact: true }).click();
  await expect(page.locator("[data-preference-state]")).toHaveAttribute("data-controlled", "false");
  await rail.focus();
  await page.keyboard.press("ArrowRight");
  await expectSelection(page, "project");
  await expect(rail).toBeFocused();
}

export async function certifySurfacePreferences(browser: Browser, url: string): Promise<void> {
  const directory = resolve(
    process.env.SNAP_MOTION_SURFACE_EVIDENCE_DIR ?? ".artifacts/surface-preferences",
    browser.browserType().name(),
  );
  await mkdir(directory, { recursive: true });
  const failures: string[] = [];
  for (const size of ["default", "wide", "mobile", "narrow-host"] as const) {
    for (const system of ["no-preference", "reduce"] as const) {
      for (const override of ["system", "true", "false"] as const) {
        if ((size === "mobile" || size === "narrow-host") && override !== "system") continue;
        const name = `${size}-${system}-${override}`;
        const width = size === "default" ? undefined : 720;
        const allocation = size === "narrow-host" ? 280 : 1120;
        const context = await browser.newContext({
          reducedMotion: system,
          viewport: { width: size === "mobile" ? 390 : 1440, height: 1000 },
        });
        const page = await context.newPage();
        const diagnostics: string[] = [];
        page.on("pageerror", (error) => diagnostics.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" || /hydration|mismatch/i.test(message.text()))
            diagnostics.push(message.text());
        });
        await page.addInitScript(() => {
          const probes: unknown[] = [];
          Object.assign(window, { surfaceHydrationProbes: probes });
          window.addEventListener("snap-motion:hydration-probe", (event) =>
            probes.push((event as CustomEvent).detail),
          );
        });
        try {
          const response = await page.goto(
            `${url}?probe&preference=${override}&allocation=${allocation}${width === undefined ? "" : `&width=${width}`}`,
          );
          const serverHtml = await response!.text();
          await writeFile(resolve(directory, `${name}-server.html`), serverHtml);
          await page.locator("[data-preference-ready]").waitFor();
          const probes = await page.evaluate(
            () =>
              (window as unknown as { surfaceHydrationProbes: HydrationProbe[] })
                .surfaceHydrationProbes,
          );
          const after = await page.locator(".snap-motion-coverflow").evaluate((root) => ({
            reducedMotion: root.getAttribute("data-reduced-motion"),
            activeId: root.getAttribute("data-active-id"),
            visualId: root.getAttribute("data-visual-id"),
            settledId: root.getAttribute("data-settled-id"),
            style: root.getAttribute("style"),
            cards: [...root.querySelectorAll<HTMLElement>("[data-item-id]")].map((card) => ({
              id: card.dataset.itemId,
              style: card.getAttribute("style"),
              html: card.innerHTML,
            })),
          }));
          const geometry = await page.locator(".snap-motion-coverflow").evaluate((root) => {
            const stage = root.getBoundingClientRect();
            const style = getComputedStyle(root);
            return {
              stageWidth: stage.width,
              cardWidth: Number.parseFloat(
                style.getPropertyValue("--snap-motion-coverflow-card-width"),
              ),
              cardHeight: Number.parseFloat(
                style.getPropertyValue("--snap-motion-coverflow-card-height"),
              ),
              perspective: Number.parseFloat(style.perspective),
              viewportWidth: document.documentElement.clientWidth,
              documentWidth: document.documentElement.scrollWidth,
              cards: [...root.querySelectorAll<HTMLElement>("[data-item-id]")].map((card) => {
                const rect = card.getBoundingClientRect();
                return {
                  id: card.dataset.itemId,
                  x: rect.x - stage.x,
                  y: rect.y - stage.y,
                  width: rect.width,
                  height: rect.height,
                  transform: card.style.transform,
                };
              }),
            };
          });
          await writeFile(
            resolve(directory, `${name}.json`),
            JSON.stringify({ system, override, diagnostics, probes, after, geometry }, null, 2),
          );
          const panels = await certifyCoverflowImagePanels(page);
          await writeFile(
            resolve(directory, `${name}-panels.json`),
            JSON.stringify(panels, null, 2),
          );
          await page.locator(".evidence").screenshot({ path: resolve(directory, `${name}.png`) });

          expect(probes.map((probe) => probe.surface).toSorted()).toEqual([
            "carousel",
            "coverflow",
            "deck",
            "sheet",
          ]);
          for (const surface of ["coverflow", "deck"]) {
            const first = probes.find((probe) => probe.surface === surface)!;
            expect(first.firstRender[0]!.attributes["data-reduced-motion"]).toBe(
              override === "true" ? "true" : "false",
            );
          }
          // Compare actual server bytes with the first hydrating VNodes of every audited surface.
          const stylePairs = await page.evaluate(
            ({ probes: captured, serverHtml: html }) => {
              const server = new DOMParser().parseFromString(html, "text/html");
              const indexes = new Map<string, number>();
              return captured
                .flatMap((probe) => probe.firstRender)
                .filter((node) => node.class?.includes("snap-motion-"))
                .map((node) => {
                  const index = indexes.get(node.class!) ?? 0;
                  indexes.set(node.class!, index + 1);
                  const expected = document.createElement("div");
                  for (const [key, value] of Object.entries(node.style ?? {})) {
                    if (key.startsWith("--")) expected.style.setProperty(key, String(value));
                    else Object.assign(expected.style, { [key]: value });
                  }
                  const actual = [...server.querySelectorAll<HTMLElement>("[class]")].filter(
                    (element) => element.className === node.class,
                  )[index]!;
                  const [serverStyles, clientStyles] = [actual, expected].map((element) =>
                    Object.fromEntries(
                      [...element.style]
                        .toSorted()
                        .map((key) => [key, element.style.getPropertyValue(key)]),
                    ),
                  );
                  const attributes = Object.entries(node.attributes).map(([key, value]) => ({
                    key,
                    server: actual.getAttribute(key),
                    client:
                      value === undefined || value === null || (key === "inert" && value === false)
                        ? null
                        : key === "inert"
                          ? ""
                          : String(value),
                  }));
                  return {
                    class: node.class,
                    server: serverStyles,
                    client: clientStyles,
                    attributes,
                  };
                });
            },
            { probes, serverHtml },
          );
          expect(
            stylePairs.filter((pair) => pair.class === "snap-motion-coverflow-card"),
          ).toHaveLength(3);
          for (const pair of stylePairs) {
            expect(pair.client).toEqual(pair.server);
            for (const attribute of pair.attributes)
              expect(attribute.client).toBe(attribute.server);
          }
          expect(after.activeId).toBe("project");
          expect(after.visualId).toBe("project");
          expect(after.settledId).toBe("project");
          const resolved = override === "system" ? system === "reduce" : override === "true";
          const rail = page.locator(".snap-motion-coverflow");
          await expect(rail).toHaveAttribute("data-reduced-motion", String(resolved));
          expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
          expect(geometry.cardWidth).toBeGreaterThan(0);
          expect(geometry.cardHeight).toBeGreaterThan(0);
          expect(geometry.cardWidth).toBeLessThanOrEqual(geometry.stageWidth - 32);
          if (size === "default") expect(geometry.cardWidth).toBe(420);
          if (size === "wide") expect(geometry.cardWidth).toBeGreaterThan(600);
          if (size === "mobile") expect(geometry.cardWidth).toBe(280);
          if (size === "narrow-host") expect(geometry.stageWidth).toBe(280);
          const focused = geometry.cards[1]!;
          expect(focused.x).toBeGreaterThanOrEqual(16);
          expect(focused.x + focused.width).toBeLessThanOrEqual(geometry.stageWidth - 16);
          if (size === "wide" && !resolved) {
            for (const side of [geometry.cards[0]!, geometry.cards[2]!]) {
              expect(side.width).toBeLessThan(focused.width);
              expect(
                Math.min(geometry.stageWidth, side.x + side.width) - Math.max(0, side.x),
              ).toBeGreaterThan(40);
            }
          }
          for (const nextSystem of ["reduce", "no-preference"] as const) {
            await page.emulateMedia({ reducedMotion: nextSystem });
            const reduced = override === "system" ? nextSystem === "reduce" : override === "true";
            await expect(rail).toHaveAttribute("data-reduced-motion", String(reduced));
            await expect(page.locator(".snap-motion-stacked-deck")).toHaveAttribute(
              "data-reduced-motion",
              String(reduced),
            );
            await expect(page.locator("[data-preference-state]")).toHaveAttribute(
              "data-sheet-reduced",
              String(reduced),
            );
            const styles = await rail
              .locator("[data-item-id]")
              .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).style.transform));
            expect(styles.every((style) => !style.includes("rotateY"))).toBe(reduced);
          }
          if (size === "wide" && override === "system") {
            await page.emulateMedia({ reducedMotion: system });
            await expect(rail).toHaveAttribute("data-reduced-motion", String(system === "reduce"));
            await certifyWideInteraction(page);
          }
          if (size === "default" && system === "no-preference" && override === "system") {
            await certifySurfaceFocus(page, directory);
          }
          expect(diagnostics).toEqual([]);
          process.stdout.write(
            `Packed Nuxt ${browser.browserType().name()} preference ${name}: passed (first render, adoption, live changes).\n`,
          );
        } catch (error) {
          failures.push(`${name}: ${String(error)}`);
        } finally {
          await writeFile(
            resolve(directory, `${name}-diagnostics.json`),
            JSON.stringify(
              {
                diagnostics,
                failures: failures.filter((failure) => failure.startsWith(`${name}:`)),
              },
              null,
              2,
            ),
          );
          await context.close();
        }
      }
    }
  }
  if (failures.length)
    throw new Error(`Packed Nuxt preference matrix failed:\n${failures.join("\n")}`);
}
