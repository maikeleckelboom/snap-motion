import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  compareArtifactCaptures,
  compareProgressAlignedGeometry,
  deriveLiveCheckpointCrossings,
  deriveProgressDomainMotionMetrics,
  deriveStackedDeckMetrics,
  type ArtifactCapture,
  type CaptureRecordingSummary,
  type CardPoseObservation,
  type ExactCheckpointSample,
  type StackedDeckVisualManifest,
  type StimulusTraceSample,
} from "./stackedDeckVisualArtifacts.ts";
import { inspectGitRevision } from "./stackedDeckVisualRevision.ts";
import {
  createStimulusSchedule,
  idealProgressAtElapsedTime,
  nextStimulusScheduleIndex,
  progressIsMonotonic,
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
    actualExecutionTimeMs: relativeTimeMs,
    actualLocalProgress: progress,
    actualPhysicalIndex: 3 + progress,
    actualPhysicalProgress: progress,
    authoritativeIndex: progress >= 0.5 ? 4 : 3,
    controllerPhase: "dragging",
    direction: "forward",
    latenessMs: 0,
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

function recording(
  screencastMeanFrameIntervalMs = 16,
  renderedP95FrameIntervalMs = 16,
): CaptureRecordingSummary {
  return {
    durationMs: 1_000,
    filename: "mouse-review.webm",
    input: "mouse",
    renderedFrameTelemetry: {
      durationMs: 1_000,
      frameCount: 60,
      maxFrameIntervalMs: renderedP95FrameIntervalMs,
      meanFrameIntervalMs: 16,
      p95FrameIntervalMs: renderedP95FrameIntervalMs,
    },
    screencastTelemetry: {
      durationMs: 1_000,
      frameCount: 30,
      maxFrameIntervalMs: screencastMeanFrameIntervalMs,
      meanFrameIntervalMs: screencastMeanFrameIntervalMs,
      p95FrameIntervalMs: screencastMeanFrameIntervalMs,
    },
    timelineSampleCount: 60,
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
      exactCheckpointReplay: {
        purpose: "test",
        sampleCount: 0,
        traceFilename: "checkpoint-trace.json",
      },
      liveStimulus: {
        checkpointBehavior: "observational-crossings-only",
        checkpointCrossingCount: 0,
        progressSource: "monotonic-elapsed-time",
      },
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
    checkpointTrace: null,
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
    expect(first.version).toBe(2);
    expect(first.artifactDirectoryName).toBe("stacked-deck-review-v2");
  });

  test("marks scenario selections and supported overrides as non-canonical", () => {
    const curve = resolveStackedDeckVisualScenario(["--scenario", "curve"]);
    const custom = resolveStackedDeckVisualScenario(["--slow-duration", "3000"]);

    expect(curve.canonical).toBe(false);
    expect(curve.version).toBe(2);
    expect(curve.artifactDirectoryName).toBe("stacked-deck-curve-v2");
    expect(custom.canonical).toBe(false);
    expect(custom.artifactDirectoryName).toMatch(/^stacked-deck-review-v2-custom-[a-f0-9]{12}$/);
  });

  test("creates a cadence-only schedule with no named-checkpoint commands", () => {
    const schedule = createStimulusSchedule(50, 16);

    expect(schedule).toEqual([{ atMs: 0 }, { atMs: 16 }, { atMs: 32 }, { atMs: 48 }, { atMs: 50 }]);
  });

  test("skips missed cadence points instead of replaying catch-up positions", () => {
    const schedule = createStimulusSchedule(64, 16);

    expect(nextStimulusScheduleIndex(schedule, 0, 33)).toBe(2);
    expect(schedule[2]).toEqual({ atMs: 32 });
    expect(nextStimulusScheduleIndex(schedule, 2, 80)).toBe(4);
    expect(schedule[4]).toEqual({ atMs: 64 });
  });

  test("keeps outbound requested progress monotonic under scheduler lateness", () => {
    const executionTimes = [0, 17, 48, 49, 81, 100];
    const requested = executionTimes.map((elapsedMs) =>
      idealProgressAtElapsedTime(0, 0.7, elapsedMs, 100),
    );

    expect(
      requested
        .slice(1)
        .every((value, index) => progressIsMonotonic(requested[index]!, value, "forward")),
    ).toBe(true);
  });

  test("keeps retrace requested progress monotonic under scheduler lateness", () => {
    const executionTimes = [0, 17, 48, 49, 81, 100];
    const requested = executionTimes.map((elapsedMs) =>
      idealProgressAtElapsedTime(0.7, 0, elapsedMs, 100),
    );

    expect(
      requested
        .slice(1)
        .every((value, index) => progressIsMonotonic(requested[index]!, value, "reverse")),
    ).toBe(true);
  });

  test("derives late-sample progress from actual elapsed time rather than schedule time", () => {
    const scheduledTimeMs = 32;
    const actualExecutionTimeMs = 80;

    expect(idealProgressAtElapsedTime(0, 0.7, actualExecutionTimeMs, 100)).toBeCloseTo(0.56, 12);
    expect(idealProgressAtElapsedTime(0, 0.7, scheduledTimeMs, 100)).toBeCloseTo(0.224, 12);
  });
});

describe("Stacked Deck live stimulus evidence", () => {
  test("observes named crossings without altering live samples", () => {
    const samples = [sample(0, 0), sample(0.3, 16), sample(0.6, 32), sample(0.7, 48)];
    const requestedBefore = samples.map((entry) => entry.requestedProgress);
    const crossings = deriveLiveCheckpointCrossings(samples, [0, 0.25, 0.5, 0.7]);

    expect(samples.map((entry) => entry.requestedProgress)).toEqual(requestedBefore);
    expect(crossings.map((crossing) => crossing.checkpointProgress)).toEqual([0, 0.25, 0.5, 0.7]);
    expect(crossings[1]?.before?.actualPhysicalProgress).toBe(0);
    expect(crossings[1]?.atOrAfter.actualPhysicalProgress).toBe(0.3);
  });

  test("keeps exact checkpoint replay error separate and effectively zero", () => {
    const checkpointSamples: ExactCheckpointSample[] = [0, 0.25, 0.5, 0.7].flatMap((progress) => {
      const observation = sample(progress, progress * 100);
      return [
        { ...observation, direction: "forward" as const, requestedProgress: progress },
        { ...observation, direction: "reverse" as const, requestedProgress: progress },
      ];
    });
    const metrics = deriveStackedDeckMetrics({
      checkpointSamples,
      mouseRenderedSamples: [],
      stimulusSamples: [sample(0, 0), sample(0.7, 100)],
      targetIndex: 4,
    });

    expect(metrics.directManipulation.forward.maximumCheckpointError).toBe(0);
    expect(metrics.directManipulation.reverse.maximumCheckpointError).toBe(0);
  });

  test("derives a deterministic progress-domain slope from a known linear trace", () => {
    const metrics = deriveProgressDomainMotionMetrics(
      [sample(0, 0), sample(0.25, 10), sample(0.5, 20), sample(0.75, 30), sample(1, 40)],
      "forward",
    );

    expect(metrics.outgoingTranslateXPerProgress?.value).toBeCloseTo(100, 10);
    expect(metrics.outgoingRotatePerProgress?.value).toBeCloseTo(4, 10);
    expect(metrics.outgoingScalePerProgress?.value).toBeCloseTo(-0.1, 10);
    expect(metrics.outgoingTranslateYPerProgress?.value).toBeCloseTo(10, 10);
    expect(metrics.outgoingTranslateXPerProgress?.progress).toBe(0);
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
  test("classifies v1 and v2 scenarios as not directly comparable", () => {
    const comparison = compareArtifactCaptures(artifact({ scenarioVersion: 1 }), artifact());

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

  test("ignores screencast changed-frame cadence differences", () => {
    const first = artifact();
    const second = artifact();
    const a = artifact({
      capture: { ...first.manifest.capture, recordings: [recording(16)] },
    });
    const b = artifact({
      capture: { ...second.manifest.capture, recordings: [recording(80)] },
    });

    const comparison = compareArtifactCaptures(a, b);

    expect(comparison.compatibility).toBe("comparable");
    expect(comparison.differences).toEqual([]);
  });

  test("warns when rendered rAF telemetry crosses the presentation-health threshold", () => {
    const first = artifact();
    const second = artifact();
    const a = artifact({
      capture: { ...first.manifest.capture, recordings: [recording(16, 16)] },
    });
    const b = artifact({
      capture: { ...second.manifest.capture, recordings: [recording(16, 64)] },
    });

    const comparison = compareArtifactCaptures(a, b);

    expect(comparison.compatibility).toBe("comparable-with-warnings");
    expect(comparison.differences).toContainEqual(
      expect.objectContaining({
        field: "capture.mouse.renderedFrameP95Health",
        severity: "warning",
      }),
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
