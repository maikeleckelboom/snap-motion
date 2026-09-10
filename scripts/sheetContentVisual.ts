import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { chromium, firefox, webkit, type Page } from "@playwright/test";

import { inspectGitRevision } from "./stackedDeckVisualRevision.ts";

const root = resolve(import.meta.dirname, "..");
const argument = (name: string, fallback: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const browserName = argument("browser", "chromium");
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);
const revision = inspectGitRevision(root);
const viewport = {
  width: Number(argument("width", "390")),
  height: Number(argument("height", "844")),
};
const travel = argument("travel", "responsive");
const content = argument("content", "menu");
const preference = argument("motion", "no-preference") === "reduce" ? "reduce" : "no-preference";
const treatments = argument("treatments", "control,reveal,offset").split(",");
const directory = resolve(
  root,
  ".artifacts/sheet-content",
  revision.identity,
  `${browserName}-${viewport.width}x${viewport.height}-${travel}-${content}-${preference}`,
);
mkdirSync(directory, { recursive: true });
const browser = await browserType.launch();

interface Frame {
  time: number;
  phase: string;
  open: boolean;
  position: number;
  viewportTop: number;
  viewportHeight: number;
  headerTop: number;
  bodyTop: number;
  bodyScrollTop: number;
  bodyClientHeight: number;
  bodyScrollHeight: number;
  contentHeight: number;
  contentWidth: number;
  contentTop: number;
  contentOpacity: number;
  contentTransform: string;
  firstLinkBottom: number | null;
  focus: string;
}

async function trace(page: Page, shouldClose: boolean): Promise<Frame[]> {
  return page.evaluate(
    async ({ closing }) => {
      const dialog = document.querySelector<HTMLDialogElement>('[data-testid="content-sheet"]')!;
      const panel = dialog.querySelector<HTMLElement>(".snap-motion-sheet-panel")!;
      const viewportElement = dialog.querySelector<HTMLElement>(".snap-motion-sheet-viewport")!;
      const header = dialog.querySelector<HTMLElement>(".snap-motion-sheet-header")!;
      const body = dialog.querySelector<HTMLElement>(".snap-motion-sheet-body")!;
      const contentElement = dialog.querySelector<HTMLElement>('[data-testid="presented-body"]')!;
      const link = contentElement.querySelector("a");
      const marker = document.createElement("span");
      marker.style.cssText =
        "position:fixed;left:0;top:0;width:20px;height:20px;background:#000;z-index:9999;pointer-events:none";
      dialog.append(marker);
      const start = performance.now();
      const samples: Frame[] = [];
      const action = closing
        ? dialog.querySelector<HTMLButtonElement>(".snap-motion-sheet-close")!
        : document.querySelector<HTMLButtonElement>('[data-testid="content-open"]')!;
      action.click();
      await new Promise<void>((done) => {
        const sample = () => {
          const time = performance.now() - start;
          marker.style.background = time < 100 ? "#fff" : "#000";
          const geometry = viewportElement.getBoundingClientRect();
          const style = getComputedStyle(contentElement);
          samples.push({
            time,
            phase: panel.dataset.sheetState ?? "",
            open: dialog.open,
            position: parseFloat(
              panel.style.getPropertyValue("--snap-motion-sheet-canonical-position"),
            ),
            viewportTop: geometry.top,
            viewportHeight: geometry.height,
            headerTop: header.getBoundingClientRect().top,
            bodyTop: body.getBoundingClientRect().top,
            bodyScrollTop: body.scrollTop,
            bodyClientHeight: body.clientHeight,
            bodyScrollHeight: body.scrollHeight,
            contentHeight: contentElement.getBoundingClientRect().height,
            contentWidth: contentElement.getBoundingClientRect().width,
            contentTop: contentElement.getBoundingClientRect().top,
            contentOpacity: Number(style.opacity),
            contentTransform: style.transform,
            firstLinkBottom: link?.getBoundingClientRect().bottom ?? null,
            focus: document.activeElement?.className ?? "",
          });
          if (time < 850) requestAnimationFrame(sample);
          else done();
        };
        requestAnimationFrame(sample);
      });
      marker.remove();
      return samples;
    },
    { closing: shouldClose },
  );
}

const results = [];
try {
  for (const treatment of treatments) {
    const target = join(directory, treatment);
    mkdirSync(target, { recursive: true });
    const context = await browser.newContext({
      viewport,
      reducedMotion: preference,
      recordVideo: { dir: target, size: viewport },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /ResizeObserver loop|hydration/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(
      `${argument("url", "http://127.0.0.1:4173/")}?demo=sheet-content&view=fixtures`,
    );
    await page.getByTestId("content-treatment").selectOption(treatment);
    await page.getByTestId("hidden-travel").selectOption(travel);
    await page.getByTestId("content-kind").selectOption(content);
    await page.getByTestId("content-open").scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const marker = document.createElement("span");
      marker.style.cssText =
        "position:fixed;left:0;top:0;width:20px;height:20px;background:#000;z-index:9999;pointer-events:none";
      document.body.append(marker);
    });
    await page.evaluate(() => document.fonts.ready);
    // Warm the module graph before recording a user interaction. The page remains at normal speed.
    await page.waitForTimeout(300);
    const opening = await trace(page, false);
    await page.screenshot({ path: join(target, "open.png") });
    const closing = await trace(page, true);
    const video = page.video();
    await context.close();
    const videoPath = join(target, "normal-speed.webm");
    await video?.saveAs(videoPath);
    const deltas = opening
      .slice(1)
      .map((frame, index) => frame.time - opening[index]!.time)
      .toSorted((a, b) => a - b);
    const summary = {
      treatment,
      errors,
      firstVisibleMs: opening.find((frame) => frame.viewportHeight > 1)?.time ?? null,
      firstReadableLinkMs:
        opening.find(
          (frame) =>
            frame.firstLinkBottom !== null &&
            frame.firstLinkBottom <= frame.viewportTop + frame.viewportHeight &&
            frame.contentOpacity >= 0.9,
        )?.time ?? null,
      fullyOpaqueMs: opening.find((frame) => frame.contentOpacity >= 0.999)?.time ?? null,
      openRestMs: opening.find((frame) => frame.phase === "open")?.time ?? null,
      closeHiddenMs: closing.find((frame) => frame.viewportHeight < 1)?.time ?? null,
      closeCompleteMs: closing.find((frame) => !frame.open)?.time ?? null,
      rafP95Ms: deltas[Math.floor(deltas.length * 0.95)] ?? null,
      maxRafGapMs: deltas.at(-1) ?? null,
    };
    writeFileSync(
      join(target, "trace.json"),
      JSON.stringify({ summary, opening, closing }, null, 2),
    );
    // Locate the white action marker in the recording's own clock, never infer video time from RAF.
    const scan = spawnSync(
      "ffmpeg",
      [
        "-i",
        videoPath,
        "-vf",
        "crop=12:12:4:4,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    let pts = 0;
    let wasDark = false;
    const actionTimes: number[] = [];
    for (const line of scan.stderr.split("\n")) {
      const timestamp = /pts_time:([\d.]+)/u.exec(line);
      if (timestamp) pts = Number(timestamp[1]);
      const luma = /lavfi.signalstats.YAVG=([\d.]+)/u.exec(line);
      if (luma) {
        const value = Number(luma[1]);
        if (value < 40) wasDark = true;
        if (wasDark && value > 220) {
          actionTimes.push(pts);
          wasDark = false;
        }
      }
    }
    for (const [index, actionTime] of actionTimes.slice(0, 2).entries()) {
      const strip = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(actionTime),
          "-i",
          videoPath,
          "-vf",
          `fps=25,scale=195:-1,tile=6x2`,
          "-frames:v",
          "1",
          join(target, index === 0 ? "opening-strip.png" : "closing-strip.png"),
        ],
        { encoding: "utf8" },
      );
      if (strip.status !== 0) throw new Error(strip.stderr);
    }
    results.push({ ...summary, actionVideoTimes: actionTimes });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }
} finally {
  await browser.close();
}
const endRevision = inspectGitRevision(root);
const sourceFiles = [
  "packages/vue/src/sheet/components/Sheet.vue",
  "packages/vue/src/sheet/use-sheet-motion.ts",
  "packages/vue/src/sheet/sheet-policy.ts",
  "packages/vue/src/sheet/sheet-geometry.ts",
  "packages/vue/src/sheet/sheet-side.ts",
  "packages/vue/src/style.css",
  "packages/vue/src/motion/use-snap-motion.ts",
  "packages/vue/src/motion/motion-driver.ts",
  "packages/vue/src/motion/reduced-motion.ts",
  "apps/lab/src/demos/sheetContentFixture.vue",
  "scripts/sheetContentVisual.ts",
].map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex"),
}));
writeFileSync(
  join(directory, "manifest.json"),
  JSON.stringify(
    {
      revision,
      endRevision,
      sourceStable: revision.identity === endRevision.identity,
      sourceFiles,
      browser: browserName,
      browserVersion: browser.version(),
      viewport,
      travel,
      content,
      preference,
      configuration:
        "Package default spring; lab body .55 to 1, 140ms ease-out, optional 8px; one participant. Readable threshold is full first-link clipping and opacity >= .9; not a perceptual score.",
      results,
    },
    null,
    2,
  ),
);
if (revision.identity !== endRevision.identity)
  throw new Error("Source changed during capture; manifest retained, recapture on a stable tree.");
process.stdout.write(`${directory}\n`);
