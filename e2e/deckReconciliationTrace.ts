import type { Page } from "@playwright/test";

/**
 * Rendered-frame evidence for the Motion Studio's Comparison Deck while its collection changes.
 *
 * Every sample is read from the DOM the browser was asked to paint: each card's inline transform,
 * z-index, shadow strength and compositor hint, plus whether it is a departing presentation. A
 * mutation is recorded exactly on both sides — the state immediately before the control is
 * activated and the state Vue published for it — and every animation frame after that.
 */

export interface TraceBody {
  readonly id: string;
  readonly exiting: boolean;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotate: number;
  readonly layer: number;
  readonly order: number;
  readonly shadow: number;
  readonly willChange: string;
  readonly item: boolean;
  readonly inert: boolean;
  readonly ariaHidden: string | null;
}

export interface TraceFrame {
  readonly t: number;
  readonly label: string;
  readonly phase: string | null;
  readonly reconciling: boolean;
  readonly deckState: string | null;
  readonly width: number;
  readonly height: number;
  readonly bodies: readonly TraceBody[];
}

declare global {
  interface Window {
    snapMotionDeckTrace?: {
      frames: TraceFrame[];
      raf: number;
      sample(label: string): TraceFrame;
    };
  }
}

/** Starts the per-frame recorder in the page. Idempotent. */
export async function startDeckTrace(page: Page) {
  await page.evaluate(() => {
    if (window.snapMotionDeckTrace !== undefined) return;
    // Browsers re-serialize inline transforms (`0` becomes `0px`, trailing zeros go), so the shape
    // is matched loosely and only the four pose numbers are read.
    const number = "(-?[\\d.]+(?:e-?\\d+)?)";
    const pattern = new RegExp(
      `translate3d\\(-50%, -50%, 0(?:px)?\\) translate3d\\(${number}px, ${number}px, 0(?:px)?\\) scale\\(${number}\\) rotate\\(${number}deg\\)`,
    );
    const sample = (label: string) => {
      const deck = document.querySelector<HTMLElement>('[data-testid="studio-deck"]');
      const bodies: TraceBody[] = [];
      let order = 0;
      for (const shell of deck?.querySelectorAll<HTMLElement>(
        ".snap-motion-stacked-deck-card, .snap-motion-stacked-deck-exit",
      ) ?? []) {
        const motion = shell.firstElementChild as HTMLElement;
        const match = pattern.exec(motion.style.transform);
        order += 1;
        if (match === null || shell.style.visibility === "hidden") continue;
        bodies.push({
          id: shell.dataset.itemId ?? "",
          exiting: shell.dataset.deckExiting === "true",
          x: Number(match[1]),
          y: Number(match[2]),
          scale: Number(match[3]),
          rotate: Number(match[4]),
          layer: Number(shell.style.zIndex),
          order,
          shadow: Number(motion.style.getPropertyValue("--snap-motion-deck-shadow-strength")),
          willChange: getComputedStyle(motion).willChange,
          item: shell.hasAttribute("data-snap-motion-stacked-deck-card"),
          inert: shell.inert,
          ariaHidden: shell.getAttribute("aria-hidden"),
        });
      }
      const style = deck === null ? undefined : getComputedStyle(deck);
      return {
        t: performance.now(),
        label,
        phase: deck?.dataset.phase ?? null,
        reconciling: deck?.dataset.reconciling === "true",
        deckState: deck === null ? null : (deck.dataset.deckState ?? "deck"),
        width: Number.parseFloat(style?.getPropertyValue("--snap-motion-deck-card-width") ?? "0"),
        height: Number.parseFloat(style?.getPropertyValue("--snap-motion-deck-card-height") ?? "0"),
        bodies,
      };
    };
    const trace = { frames: [] as TraceFrame[], raf: 0, sample };
    const tick = () => {
      trace.frames.push(sample("raf"));
      trace.raf = requestAnimationFrame(tick);
    };
    trace.raf = requestAnimationFrame(tick);
    window.snapMotionDeckTrace = trace;
  });
}

/**
 * Activates a control and records the exact DOM state on both sides of it: the frame the eye last
 * saw, and the one the application published in response, before any animation frame runs.
 */
export async function mutateTraced(page: Page, testId: string, label: string) {
  await page.evaluate(
    async ([control, name]) => {
      const trace = window.snapMotionDeckTrace!;
      trace.frames.push(trace.sample(`before:${name}`));
      document.querySelector<HTMLElement>(`[data-testid="${control}"]`)!.click();
      // Vue publishes on the microtask queue; several turns cover a parent and a child flush.
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      trace.frames.push(trace.sample(`after:${name}`));
    },
    [testId, label] as const,
  );
}

export async function stopDeckTrace(page: Page): Promise<TraceFrame[]> {
  return page.evaluate(() => {
    const trace = window.snapMotionDeckTrace!;
    cancelAnimationFrame(trace.raf);
    delete window.snapMotionDeckTrace;
    return trace.frames;
  });
}

export async function waitForDeckRest(page: Page) {
  await page.waitForFunction(() => {
    const deck = document.querySelector<HTMLElement>('[data-testid="studio-deck"]');
    return (
      deck === null ||
      (deck.dataset.phase === "idle" &&
        deck.dataset.reconciling !== "true" &&
        deck.querySelector(".snap-motion-stacked-deck-exit") === null)
    );
  });
}

function contains(body: TraceBody, x: number, y: number, width: number, height: number) {
  if (body.scale <= 0) return false;
  const radians = (-body.rotate * Math.PI) / 180;
  const dx = x - body.x;
  const dy = y - body.y;
  return (
    Math.abs((dx * Math.cos(radians) + dy * Math.sin(radians)) / body.scale) <= width / 2 &&
    Math.abs((-dx * Math.sin(radians) + dy * Math.cos(radians)) / body.scale) <= height / 2
  );
}

/** One body, spelled out for a failure message. */
function describe(body: TraceBody) {
  return `${body.id}${body.exiting ? "(x)" : ""} L${body.layer} (${body.x.toFixed(1)},${body.y.toFixed(1)}) s${body.scale.toFixed(3)} r${body.rotate.toFixed(2)}`;
}

function ownerAt(bodies: readonly TraceBody[], x: number, y: number, w: number, h: number) {
  let owner: TraceBody | undefined;
  for (const body of bodies) {
    if (!contains(body, x, y, w, h)) continue;
    if (
      owner === undefined ||
      body.layer > owner.layer ||
      (body.layer === owner.layer && body.order > owner.order)
    )
      owner = body;
  }
  return owner;
}

function* stagePoints(width: number, height: number, density = 1) {
  for (let x = -width * 1.6; x <= width * 1.6; x += width / (24 * density)) {
    for (let y = -height; y <= height; y += height / (14 * density)) yield [x, y] as const;
  }
}

export interface ReconciliationAnalysis {
  /** Largest pose difference of any surviving card between the frame before and after the change. */
  readonly firstFrameJump: number;
  /** Largest single-frame corner displacement of any surviving card. */
  readonly largestJump: number;
  readonly largestJumpId: string;
  /** Largest single-frame shadow-strength change of any surviving card. */
  readonly largestShadowJump: number;
  /** Paint-order changes at points both bodies still covered on both frames. */
  readonly paintSwaps: readonly string[];
  /** Bodies that appeared or vanished while some of them could be seen. */
  readonly visibleAppearances: readonly string[];
  /** Compositor hints that changed on a frame where the deck came to rest. */
  readonly stillHintChanges: readonly string[];
  /** Departing bodies that were interactive or exposed to assistive technology. */
  readonly exposedDepartures: readonly string[];
  readonly frames: number;
}

function poseDistance(a: TraceBody, b: TraceBody, width: number, height: number) {
  const radius = Math.hypot(width, height) / 2;
  return Math.max(
    Math.hypot(a.x - b.x, a.y - b.y),
    Math.abs(a.scale - b.scale) * radius,
    Math.abs(a.rotate - b.rotate) * (Math.PI / 180) * radius,
  );
}

/** Analyses the frames from the `before:` sample of `label` to the next labelled mutation. */
export function analyseReconciliation(
  frames: readonly TraceFrame[],
  label: string,
): ReconciliationAnalysis {
  const start = frames.findIndex((frame) => frame.label === `before:${label}`);
  if (start < 0) throw new Error(`no mutation labelled ${label}`);
  let end = frames.findIndex(
    (frame, index) => index > start + 1 && frame.label.startsWith("before:"),
  );
  if (end < 0) end = frames.length;
  const slice = frames
    .slice(start, end)
    .filter((frame) => frame.bodies.length > 0 || frame.label !== "raf");
  const width = slice.find((frame) => frame.width > 0)?.width ?? 0;
  const height = slice.find((frame) => frame.height > 0)?.height ?? 0;
  let firstFrameJump = 0;
  let largestJump = 0;
  let largestJumpId = "";
  let largestShadowJump = 0;
  const paintSwaps: string[] = [];
  const visibleAppearances: string[] = [];
  const stillHintChanges: string[] = [];
  const exposedDepartures: string[] = [];
  const owns = (frame: TraceFrame, id: string) => {
    for (const [x, y] of stagePoints(width, height, 2)) {
      if (ownerAt(frame.bodies, x, y, width, height)?.id === id) return true;
    }
    return false;
  };
  for (let index = 1; index < slice.length; index += 1) {
    const before = slice[index - 1]!;
    const after = slice[index]!;
    if (before.width !== after.width || before.deckState === null || after.deckState === null)
      continue;
    for (const body of after.bodies) {
      if (body.exiting && (body.item || !body.inert || body.ariaHidden !== "true")) {
        exposedDepartures.push(`${after.label} ${body.id}`);
      }
      const previous = before.bodies.find((candidate) => candidate.id === body.id);
      if (previous === undefined) continue;
      const distance = poseDistance(previous, body, width, height);
      if (!body.exiting) {
        if (index === 1) firstFrameJump = Math.max(firstFrameJump, distance);
        if (distance > largestJump) {
          largestJump = distance;
          largestJumpId = `${body.id}@${index}`;
        }
        largestShadowJump = Math.max(largestShadowJump, Math.abs(body.shadow - previous.shadow));
      }
      // Settlement and the end of a reconciliation move nothing; a hint changing there is a raster
      // change with no physical change behind it.
      const restBoundary =
        after.phase === "idle" &&
        !after.reconciling &&
        (before.phase !== "idle" || before.reconciling);
      if (restBoundary && previous.willChange !== body.willChange) {
        stillHintChanges.push(`${index} ${body.id} ${previous.willChange}->${body.willChange}`);
      }
    }
    for (const [x, y] of stagePoints(width, height)) {
      const a = ownerAt(before.bodies, x, y, width, height);
      const b = ownerAt(after.bodies, x, y, width, height);
      if (a === undefined || b === undefined || a.id === b.id) continue;
      const aAfter = after.bodies.find((body) => body.id === a.id);
      const bBefore = before.bodies.find((body) => body.id === b.id);
      if (aAfter === undefined || bBefore === undefined) continue;
      if (contains(aAfter, x, y, width, height) && contains(bBefore, x, y, width, height)) {
        paintSwaps.push(
          `${index} ${a.id}->${b.id} at (${x.toFixed(0)},${y.toFixed(0)}) | ${before.label} ${before.phase} rec=${before.reconciling}: ${before.bodies.map(describe).join("; ")} | ${after.label} ${after.phase} rec=${after.reconciling}: ${after.bodies.map(describe).join("; ")}`,
        );
      }
    }
    for (const body of before.bodies) {
      if (!after.bodies.some((candidate) => candidate.id === body.id) && owns(before, body.id)) {
        visibleAppearances.push(`${body.id} vanished at ${index}`);
      }
    }
    for (const body of after.bodies) {
      if (!before.bodies.some((candidate) => candidate.id === body.id) && owns(after, body.id)) {
        visibleAppearances.push(`${body.id} appeared at ${index}`);
      }
    }
  }
  return {
    firstFrameJump,
    largestJump,
    largestJumpId,
    largestShadowJump,
    // One entry per frame pair and owner change, with both frames spelled out for diagnosis.
    paintSwaps: [
      ...new Map(paintSwaps.map((swap) => [swap.split(" at ")[0], swap] as const)).values(),
    ],
    visibleAppearances,
    stillHintChanges,
    exposedDepartures,
    frames: slice.length,
  };
}
