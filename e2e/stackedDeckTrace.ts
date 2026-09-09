import assert from "node:assert/strict";

import type { Page } from "@playwright/test";

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DirectRafTraceShell {
  readonly bottom: number;
  readonly computedTransform: string;
  readonly elapsed: number;
  readonly id: string;
  readonly identity: number;
  readonly index: number;
  readonly interactive: boolean;
  readonly landingOrder: number;
  readonly layer: number;
  readonly left: number;
  readonly opacity: number;
  readonly expectedComputedTransform: string;
  readonly polygon: readonly Point[];
  readonly releaseX: number;
  readonly releaseY: number;
  readonly right: number;
  readonly role: string;
  readonly rotate: number;
  readonly scale: number;
  readonly settlement: number;
  readonly top: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly updatedAt: number;
  readonly visible: boolean;
  readonly published: {
    readonly layer: number;
    readonly rotate: number;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
  };
}

export interface DirectRafTraceFrame {
  readonly authoritativeIndex: number;
  readonly directDirection: number;
  readonly directOriginIndex: number;
  readonly directReleaseX: number;
  readonly directReleaseY: number;
  readonly directPhase: string;
  readonly directSettlement: number;
  readonly directSignedTravel: number;
  readonly directTargetIndex: number;
  readonly frame: number;
  readonly landingCount: number;
  readonly painted: { readonly center: string; readonly left: string; readonly right: string };
  readonly paintedX: { readonly center: number; readonly left: number; readonly right: number };
  readonly paintedY: number;
  readonly revision: number;
  readonly sampledAt: number;
  readonly shells: readonly DirectRafTraceShell[];
  readonly snapshotFrozen: boolean;
  readonly source: "publication" | "raf";
  readonly timestamp: number;
}

export interface DirectTraceReview {
  readonly maximumLandingCount: number;
  /** The sampled endpoints cannot establish the intermediate painted handoff. */
  readonly unobservedPaintHandoffs: readonly {
    readonly beforeRevision: number;
    readonly afterRevision: number;
    readonly region: "center" | "left" | "right";
    readonly beforeOwner: string;
    readonly afterOwner: string;
    readonly intervalMs: number;
  }[];
}

/**
 * Publication events run after Vue patches the component DOM. They are not paint notifications.
 * They preserve every arrival publication even when an independent RAF recorder misses samples.
 * RAF callbacks have microtask checkpoints between them: nested microtasks cannot turn an early
 * recorder into an end-of-frame observer. Its snapshot may legitimately precede a later updater.
 */
export async function startDirectRafTrace(page: Page, rafEvery = 1): Promise<void> {
  await page.evaluate((sampleEvery) => {
    const tracedWindow = window as typeof window & {
      snapMotionDirectRafTrace?: DirectRafTraceFrame[];
      snapMotionDirectRafTraceStop?: () => void;
    };
    tracedWindow.snapMotionDirectRafTraceStop?.();
    const frames: DirectRafTraceFrame[] = [];
    tracedWindow.snapMotionDirectRafTrace = frames;
    const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
    const identities = new WeakMap<Element, number>();
    const reference = document.createElement("div");
    reference.style.cssText =
      "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:strict";
    document.body.append(reference);
    let nextIdentity = 0;
    const sample = (source: "publication" | "raf") => {
      const rendered = (
        root as HTMLElement & {
          snapMotionDirectDebug?: {
            rendered?: {
              revision: number;
              timestamp: number;
              landings: readonly {
                elapsed: number;
                itemIndex: number;
                releaseOrder: number;
                settlement: number;
                translateX: number;
                translateY: number;
                updatedAt: number;
              }[];
              poses: readonly DirectRafTraceShell["published"][];
              projection: {
                direction: number;
                originIndex: number;
                phase?: string;
                settlement: number;
                signedTravel: number;
                targetIndex: number | null;
                translateX: number;
                translateY: number;
              };
            };
          };
        }
      ).snapMotionDirectDebug?.rendered;
      if (rendered === undefined) throw new Error("No rendered Direct diagnostic snapshot");
      const { landings, projection } = rendered;
      const rootBox = root.getBoundingClientRect();
      const stageBox = root
        .querySelector<HTMLElement>(".snap-motion-stacked-deck-stage")!
        .getBoundingClientRect();
      const cards = [...root.querySelectorAll<HTMLElement>("[data-snap-motion-stacked-deck-card]")];
      const shells = cards.map((card, index) => {
        const landing = landings.find((candidate) => candidate.itemIndex === index);
        const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const style = getComputedStyle(motion);
        const shellStyle = getComputedStyle(card);
        const computedTransform = style.transform;
        const matrix = new DOMMatrixReadOnly(style.transform);
        const width = Number.parseFloat(style.width);
        const height = Number.parseFloat(style.height);
        const box = motion.getBoundingClientRect();
        const centerX = (box.left + box.right) / 2;
        const centerY = (box.top + box.bottom) / 2;
        const published = rendered.poses[index]!;
        reference.style.width = style.width;
        reference.style.height = style.height;
        reference.style.transform = `translate3d(-50%, -50%, 0) translate3d(${published.translateX.toFixed(3)}px, ${published.translateY.toFixed(3)}px, 0) scale(${published.scale.toFixed(5)}) rotate(${published.rotate.toFixed(3)}deg)`;
        const expectedComputedTransform = getComputedStyle(reference).transform;
        const polygon = [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ].map(([x, y]) => ({
          x: centerX + matrix.a * x! + matrix.c * y!,
          y: centerY + matrix.b * x! + matrix.d * y!,
        }));
        let identity = identities.get(card);
        if (identity === undefined) identities.set(card, (identity = ++nextIdentity));
        return {
          bottom: box.bottom,
          computedTransform,
          elapsed: landing?.elapsed ?? Number.NaN,
          id: card.dataset.itemId ?? "",
          identity,
          index,
          interactive: card.dataset.deckInteractive === "true",
          landingOrder: landing?.releaseOrder ?? Number.NaN,
          layer: Number(shellStyle.zIndex),
          left: box.left,
          opacity: Number(shellStyle.opacity),
          expectedComputedTransform,
          polygon,
          published: { ...rendered.poses[index]! },
          releaseX: landing?.translateX ?? Number.NaN,
          releaseY: landing?.translateY ?? Number.NaN,
          right: box.right,
          role: card.dataset.deckRole ?? "",
          rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
          scale: Math.hypot(matrix.a, matrix.b),
          settlement: landing?.settlement ?? Number.NaN,
          top: box.top,
          // Computed matrix strings round large translations to six significant digits. The
          // measured body centre retains the layout precision needed by the position assertion.
          translateX: centerX - (stageBox.left + stageBox.right) / 2,
          translateY: centerY - (stageBox.top + stageBox.bottom) / 2,
          updatedAt: landing?.updatedAt ?? Number.NaN,
          visible: shellStyle.visibility === "visible",
        };
      });
      // Hit testing excludes inert/pointer-events:none shells even when they visibly occlude the
      // top. Read the actual transformed body and computed paint rank instead. Rounded corner and
      // shadow pixels are deliberately outside this rectangular-body oracle's claim.
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- serialized browser closure.
      const contains = (shell: DirectRafTraceShell, x: number, y: number) => {
        if (!shell.visible || shell.opacity <= 0) return false;
        let sign = 0;
        for (let index = 0; index < shell.polygon.length; index += 1) {
          const a = shell.polygon[index]!;
          const b = shell.polygon[(index + 1) % shell.polygon.length]!;
          const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
          if (Math.abs(cross) < 1e-7) continue;
          if (sign !== 0 && Math.sign(cross) !== sign) return false;
          sign = Math.sign(cross);
        }
        return sign !== 0;
      };
      const ownerAt = (x: number, y: number) => {
        let owner: DirectRafTraceShell | undefined;
        for (const shell of shells) {
          if (contains(shell, x, y) && (owner === undefined || shell.layer >= owner.layer)) {
            owner = shell;
          }
        }
        return owner?.id ?? "";
      };
      const centerX = rootBox.left + rootBox.width / 2;
      const centerY = rootBox.top + rootBox.height / 2;
      const cardWidth = Number(root.dataset.cardWidth);
      frames.push({
        authoritativeIndex: Number(root.dataset.authoritativeIndex),
        directDirection: projection.direction,
        directOriginIndex: projection.originIndex,
        directReleaseX: projection.translateX,
        directReleaseY: projection.translateY,
        directPhase: projection.phase ?? "",
        directSettlement: projection.settlement,
        directSignedTravel: projection.signedTravel,
        directTargetIndex: projection.targetIndex ?? Number.NaN,
        frame: frames.length,
        landingCount: landings.length,
        painted: {
          center: ownerAt(centerX, centerY),
          left: ownerAt(centerX - cardWidth * 0.46, centerY),
          right: ownerAt(centerX + cardWidth * 0.46, centerY),
        },
        paintedX: {
          center: centerX,
          left: centerX - cardWidth * 0.46,
          right: centerX + cardWidth * 0.46,
        },
        paintedY: centerY,
        revision: rendered.revision,
        sampledAt: performance.now(),
        shells,
        snapshotFrozen:
          Object.isFrozen(rendered) &&
          Object.isFrozen(projection) &&
          Object.isFrozen(landings) &&
          landings.every(Object.isFrozen) &&
          Object.isFrozen(rendered.poses) &&
          rendered.poses.every(Object.isFrozen),
        source,
        timestamp: rendered.timestamp,
      });
    };
    let raf = 0;
    let ticks = 0;
    const record = () => {
      if (ticks++ % sampleEvery === 0) sample("raf");
      raf = requestAnimationFrame(record);
    };
    const publication = () => sample("publication");
    root.addEventListener("snap-motion-direct-frame", publication);
    raf = requestAnimationFrame(record);
    tracedWindow.snapMotionDirectRafTraceStop = () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("snap-motion-direct-frame", publication);
      reference.remove();
    };
  }, rafEvery);
}

export async function stopDirectRafTrace(page: Page): Promise<readonly DirectRafTraceFrame[]> {
  return page.evaluate(() => {
    const tracedWindow = window as typeof window & {
      snapMotionDirectRafTrace?: readonly DirectRafTraceFrame[];
      snapMotionDirectRafTraceStop?: () => void;
    };
    tracedWindow.snapMotionDirectRafTraceStop?.();
    delete tracedWindow.snapMotionDirectRafTraceStop;
    return tracedWindow.snapMotionDirectRafTrace ?? [];
  });
}

function containsPaintSample(shell: DirectRafTraceShell, x: number, y: number): boolean {
  if (!shell.visible || shell.opacity <= 0) return false;
  let sign = 0;
  for (let index = 0; index < shell.polygon.length; index += 1) {
    const a = shell.polygon[index]!;
    const b = shell.polygon[(index + 1) % shell.polygon.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-7) continue;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return sign !== 0;
}

function geometryChanged(before: DirectRafTraceShell, after: DirectRafTraceShell): boolean {
  return (
    before.computedTransform !== after.computedTransform ||
    before.polygon.some(
      (point, index) => point.x !== after.polygon[index]!.x || point.y !== after.polygon[index]!.y,
    )
  );
}

/** Rejects inconsistent publications and requires observed arrival, never time that could suffice. */
export function expectDirectTraceCoherent(
  frames: readonly DirectRafTraceFrame[],
): DirectTraceReview {
  // This is a pure trace validator. Native assertions preserve every predicate without emitting
  // tens of thousands of Playwright reporting steps after the browser has finished recording.
  assert.ok(frames.length > 0, "the recorder produced no evidence");
  let maximumLandingCount = 0;
  const unobservedPaintHandoffs: Array<DirectTraceReview["unobservedPaintHandoffs"][number]> = [];
  const identities = new Map<string, number>();
  for (const [frameIndex, frame] of frames.entries()) {
    assert.equal(frame.snapshotFrozen, true, `mutable snapshot at frame ${frame.frame}`);
    const landings = frame.shells.filter((shell) => Number.isFinite(shell.settlement));
    maximumLandingCount = Math.max(maximumLandingCount, landings.length);
    assert.equal(landings.length, frame.landingCount, `landing count at frame ${frame.frame}`);
    assert.equal(new Set(frame.shells.map((shell) => shell.id)).size, frame.shells.length);
    assert.equal(new Set(landings.map((shell) => shell.landingOrder)).size, landings.length);
    for (const shell of frame.shells) {
      const where = `${shell.id} at publication ${frame.revision}`;
      const identity = identities.get(shell.id);
      if (identity !== undefined) assert.equal(shell.identity, identity, `replaced shell ${where}`);
      identities.set(shell.id, shell.identity);
      assert.equal(
        shell.layer,
        shell.published.layer,
        `computed paint rank disagrees with publication: ${where}`,
      );
      // Compare the browser's own canonical matrix strings exactly. Parsing its six-significant-
      // digit serialization or layout-quantized bounding boxes back into model units invents a
      // rounding error. The separate polygon and retirement assertions still use actual geometry.
      assert.equal(
        shell.computedTransform,
        shell.expectedComputedTransform,
        `computed transform mismatch: ${where}`,
      );
      if (Number.isFinite(shell.settlement)) {
        assert.equal(shell.opacity, 1, `transparent landing: ${where}`);
        assert.equal(shell.interactive, false, `interactive landing: ${where}`);
      }
    }
    if (frameIndex === 0) continue;
    const previous = frames[frameIndex - 1]!;
    assert.ok(frame.revision >= previous.revision, "publication moved backwards");
    if (frame.source === "publication") {
      assert.equal(frame.revision, previous.revision + 1, "a DOM publication was not sampled");
    }
    for (const prior of previous.shells.filter((shell) => Number.isFinite(shell.settlement))) {
      const current = landings.find((shell) => shell.landingOrder === prior.landingOrder);
      if (current !== undefined) {
        assert.ok(current.settlement >= prior.settlement, `landing ${prior.landingOrder} reversed`);
      } else {
        assert.equal(
          prior.elapsed,
          1,
          `landing ${prior.landingOrder} retired without an observed arrival`,
        );
        assert.equal(
          prior.settlement,
          1,
          `landing ${prior.landingOrder} retired before exact settlement`,
        );
      }
    }
    for (const region of ["center", "left", "right"] as const) {
      const beforeOwner = previous.painted[region];
      const afterOwner = frame.painted[region];
      if (beforeOwner === afterOwner || beforeOwner === "" || afterOwner === "") continue;
      const beforeShell = previous.shells.find((shell) => shell.id === beforeOwner)!;
      const afterShell = frame.shells.find((shell) => shell.id === afterOwner)!;
      const beforeAfter = frame.shells.find((shell) => shell.id === beforeOwner)!;
      const afterBefore = previous.shells.find((shell) => shell.id === afterOwner)!;
      const bodyEdgeCrossing =
        containsPaintSample(beforeShell, previous.paintedX[region], previous.paintedY) !==
          containsPaintSample(beforeAfter, frame.paintedX[region], frame.paintedY) ||
        containsPaintSample(afterBefore, previous.paintedX[region], previous.paintedY) !==
          containsPaintSample(afterShell, frame.paintedX[region], frame.paintedY);
      if (bodyEdgeCrossing) continue;
      assert.ok(
        geometryChanged(beforeShell, beforeAfter) || geometryChanged(afterBefore, afterShell),
        `${region} paint changed ${beforeOwner} -> ${afterOwner} at publication ${frame.revision} without a body-edge crossing or body motion`,
      );
      // Both endpoints can cover a point while an entire out-and-back clearance excursion fell
      // between samples. That is neither observed clearance nor evidence of an unsafe crossover.
      // Preserve the ambiguous interval for review; exact-boundary model/DOM tests own the proof.
      unobservedPaintHandoffs.push({
        beforeRevision: previous.revision,
        afterRevision: frame.revision,
        region,
        beforeOwner,
        afterOwner,
        intervalMs: frame.timestamp - previous.timestamp,
      });
    }
  }
  return { maximumLandingCount, unobservedPaintHandoffs };
}
