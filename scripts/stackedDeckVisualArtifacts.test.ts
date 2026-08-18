import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  compareArtifactCaptures,
  compareProgressAlignedGeometry,
  deriveStackedDeckMetrics,
  type ArtifactCapture,
  type CardPoseObservation,
  type StackedDeckVisualManifest,
  type StimulusTraceSample,
} from "./stackedDeckVisualArtifacts.ts";
import { inspectGitRevision } from "./stackedDeckVisualRevision.ts";
import {
  createStimulusSchedule,
  resolveStackedDeckVisualScenario,
  STACKED_DECK_REVIEW_SCENARIO_ID,
  STACKED_DECK_VISUAL_SCHEMA_VERSION,
} from "./stackedDeckVisualScenario.ts";

function git(directory: string, ...arguments_: string[]): void {
  execFileSync("git", arguments_, { cwd: directory, stdio: "ignore" });
}

function pose(id: string, index: number, progress: number): CardPoseObservation {
  return {
    id,
    index,
    layer: index + (progress >= 0.5 ? 1 : 0),
    opacity: 1,
    rotate: progress * 4,
    scale: 1 - progress * 0.1,
    shadowStrength: 1 - progress * 0.5,
    translateX: progress * 100,
    translateY: progress * 10,
  };
}

function sample(progress: number, relativeTimeMs: number): StimulusTraceSample {
  return {
    actualLocalProgress: progress,
    actualPhysicalIndex: 3 + progress,
    actualPhysicalProgress: progress,
    authoritativeIndex: progress >= 0.5 ? 4 : 3,
    controllerPhase: "dragging",
    direction: "forward",
    outgoing: pose("team", 3, progress),
    relativeTimeMs,
    requestedProgress: progress,
    sampleKind: "stimulus",
    scheduledTimeMs: relativeTimeMs,
    segmentOriginIndex: 3,
    segmentTargetIndex: 4,
    target: pose("settings", 4, progress),
    visualTopIndex: progress >= 0.5 ? 4 : 3,
  };
}

function artifact(
  overrides: Partial<StackedDeckVisualManifest> = {},
  samples: readonly StimulusTraceSample[] = [sample(0, 0), sample(0.5, 10), sample(1, 20)],
): ArtifactCapture {
  const scenario = resolveStackedDeckVisualScenario();
  const derivedMetrics = deriveStackedDeckMetrics({
    mouseRenderedSamples: [],
    stimulusSamples: samples,
    targetIndex: 4,
  });
  const manifest: StackedDeckVisualManifest = {
    application: {
      motionPitch: 600,
      projectionTuning: {},
      relevantPhysicsConfiguration: {},
      reviewCardPair: ["team", "settings"],
      startingItem: "team",
      tuningProfile: "wide",
    },
    artifactFiles: [],
    canonical: true,
    capture: {
      recordings: [],
      video: {
        codec: "vp8",
        configuredScreencastQuality: 90,
        container: "webm",
        dimensions: scenario.config.viewport,
        encoderFrameRate: 25,
      },
    },
    captureCreatedAt: "2026-08-18T00:00:00.000Z",
    derivedMetrics,
    dirty: false,
    environment: {
      browserName: "chromium",
      browserVersion: "140.0.1",
      colorScheme: "light",
      deviceScaleFactor: 1,
      locale: "en-US",
      playwrightVersion: "1.61.1",
      reducedMotion: "no-preference",
      timezoneId: "UTC",
      viewport: scenario.config.viewport,
    },
    reproductionCommand: "pnpm visual:stacked-deck",
    resolvedScenarioConfig: scenario.config,
    revision: "1234567",
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
    shortSha: "1234567",
    warnings: [],
    workingTreeFingerprint: null,
    ...overrides,
  };
  return {
    directory: "C:/artifact",
    keyboardRenderTrace: null,
    keyboardTimeline: null,
    manifest,
    mouseRenderTrace: {
      input: "mouse",
      recordingDurationMs: 20,
      samples: [],
      scenarioId: manifest.scenarioId,
      scenarioVersion: manifest.scenarioVersion,
      schemaVersion: manifest.schemaVersion,
    },
    mouseTimeline: {
      checkpointCapture: { mode: "test", progress: [] },
      phases: [],
      recordingDurationMs: 20,
      scenarioId: manifest.scenarioId,
      scenarioVersion: manifest.scenarioVersion,
      schemaVersion: manifest.schemaVersion,
      stimulusTrace: samples,
    },
  };
}

describe("Stacked Deck visual scenario resolution", () => {
  test("resolves the canonical scenario deterministically with a versioned identity", () => {
    const first = resolveStackedDeckVisualScenario();
    const second = resolveStackedDeckVisualScenario();

    expect(first).toEqual(second);
    expect(first.canonical).toBe(true);
    expect(first.id).toBe(STACKED_DECK_REVIEW_SCENARIO_ID);
    expect(first.version).toBe(1);
    expect(first.artifactDirectoryName).toBe("stacked-deck-review-v1");
  });

  test("marks scenario selections and supported overrides as non-canonical", () => {
    const curve = resolveStackedDeckVisualScenario(["--scenario", "curve"]);
    const custom = resolveStackedDeckVisualScenario(["--slow-duration", "3000"]);

    expect(curve.canonical).toBe(false);
    expect(curve.artifactDirectoryName).toBe("stacked-deck-curve-v1");
    expect(custom.canonical).toBe(false);
    expect(custom.artifactDirectoryName).toMatch(/^stacked-deck-review-v1-custom-[a-f0-9]{12}$/);
  });

  test("merges exact named checkpoints into the high-rate schedule", () => {
    const schedule = createStimulusSchedule(2_500, 16, [0.47, 0.5], 0, 0.7);

    expect(schedule).toContainEqual({
      atMs: (2_500 * 0.47) / 0.7,
      checkpointProgress: 0.47,
      sampleKind: "checkpoint",
    });
    expect(schedule).toContainEqual({
      atMs: (2_500 * 0.5) / 0.7,
      checkpointProgress: 0.5,
      sampleKind: "checkpoint",
    });
  });
});

describe("Stacked Deck revision identity", () => {
  test("tracks staged, unstaged, and untracked material while ignoring artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "snap-motion-visual-revision-"));
    try {
      git(directory, "init", "--quiet");
      git(directory, "config", "user.email", "visual@example.test");
      git(directory, "config", "user.name", "Visual Test");
      await writeFile(join(directory, ".gitignore"), ".artifacts/\n", "utf8");
      await writeFile(join(directory, "tracked.txt"), "original\n", "utf8");
      git(directory, "add", ".gitignore", "tracked.txt");
      git(directory, "commit", "--quiet", "-m", "test: fixture");

      const clean = inspectGitRevision(directory);
      expect(clean.dirty).toBe(false);
      expect(clean.identity).toBe(clean.shortSha);

      await writeFile(join(directory, "tracked.txt"), "tracked-a\n", "utf8");
      git(directory, "add", "tracked.txt");
      const staged = inspectGitRevision(directory);
      await writeFile(join(directory, "tracked.txt"), "tracked-b\n", "utf8");
      const unstaged = inspectGitRevision(directory);
      expect(staged.workingTreeFingerprint).not.toBe(unstaged.workingTreeFingerprint);

      await writeFile(join(directory, "tracked.txt"), "original\n", "utf8");
      git(directory, "add", "tracked.txt");
      await writeFile(join(directory, "untracked.txt"), "untracked-a\n", "utf8");
      const untrackedA = inspectGitRevision(directory);
      await writeFile(join(directory, "untracked.txt"), "untracked-b\n", "utf8");
      const untrackedB = inspectGitRevision(directory);
      expect(untrackedA.workingTreeFingerprint).not.toBe(untrackedB.workingTreeFingerprint);

      await rm(join(directory, "untracked.txt"));
      await mkdir(join(directory, ".artifacts"));
      await writeFile(join(directory, ".artifacts", "ignored.txt"), "ignored\n", "utf8");
      expect(inspectGitRevision(directory)).toEqual(clean);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("Stacked Deck artifact comparison", () => {
  test("rejects incompatible scenario versions", () => {
    const comparison = compareArtifactCaptures(artifact(), artifact({ scenarioVersion: 2 }));

    expect(comparison.compatibility).toBe("not-directly-comparable");
    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ field: "scenarioVersion", severity: "hard" }),
    );
  });

  test("warns on defined environment differences", () => {
    const original = artifact();
    const changed = artifact({
      environment: { ...original.manifest.environment, browserVersion: "140.0.2" },
    });
    const comparison = compareArtifactCaptures(original, changed);

    expect(comparison.compatibility).toBe("comparable-with-warnings");
    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ field: "environment.browserVersion", severity: "warning" }),
    );
  });

  test("aligns direct-manipulation geometry by physical progress rather than frame index", () => {
    const a = [sample(0, 0), sample(0.5, 10), sample(1, 20)];
    const b = [sample(0, 0), sample(0.25, 5), sample(0.75, 15), sample(1, 20)];
    const comparison = compareProgressAlignedGeometry(a, b, "forward");

    expect(comparison).not.toBeNull();
    expect(comparison?.metrics["outgoing.translateX"]?.maximumAbsoluteDifference).toBeCloseTo(
      0,
      10,
    );
    expect(comparison?.sampleCount).toBeGreaterThan(Math.max(a.length, b.length));
  });
});
