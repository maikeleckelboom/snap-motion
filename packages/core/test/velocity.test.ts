import { describe, expect, it } from "vitest";

import { VelocityTracker } from "../src";

describe("VelocityTracker", () => {
  it("reports constant motion in CSS pixels per second", () => {
    const tracker = new VelocityTracker();
    for (let timestampMs = 0; timestampMs <= 100; timestampMs += 20) {
      tracker.add(timestampMs / 2, timestampMs);
    }
    expect(tracker.getVelocity()).toBeCloseTo(500, 6);
  });

  it("makes the px/s unit explicit across a 100ms interval", () => {
    const tracker = new VelocityTracker({ windowMs: 100 });
    tracker.add(0, 0);
    tracker.add(100, 100);
    expect(tracker.getVelocity()).toBeCloseTo(1000, 6);
  });

  it("weights recent acceleration more strongly than the full-window average", () => {
    const tracker = new VelocityTracker({ windowMs: 100, recencyWeight: 4 });
    tracker.add(0, 0);
    tracker.add(2, 25);
    tracker.add(8, 50);
    tracker.add(22, 75);
    tracker.add(45, 100);
    expect(tracker.getVelocity()).toBeGreaterThan(450);
  });

  it("reflects deceleration and a stationary final event without using only the final pair", () => {
    const tracker = new VelocityTracker({ windowMs: 100, recencyWeight: 3 });
    tracker.add(0, 0);
    tracker.add(30, 20);
    tracker.add(50, 40);
    tracker.add(62, 60);
    tracker.add(68, 80);
    tracker.add(68, 100);
    const velocity = tracker.getVelocity();
    expect(velocity).toBeGreaterThan(0);
    expect(velocity).toBeLessThan(680);
  });

  it("ignores duplicate, reversed, and non-finite timestamps", () => {
    const tracker = new VelocityTracker();
    expect(tracker.add(0, 10)).toBe(true);
    expect(tracker.add(10, 10)).toBe(false);
    expect(tracker.add(10, 9)).toBe(false);
    expect(tracker.add(10, Number.NaN)).toBe(false);
    expect(tracker.add(Number.POSITIVE_INFINITY, 20)).toBe(false);
    expect(tracker.sampleCount).toBe(1);
  });

  it("keeps the nearest preceding sample for sparse input", () => {
    const tracker = new VelocityTracker({ windowMs: 60 });
    tracker.add(0, 0);
    tracker.add(100, 200);
    expect(tracker.sampleCount).toBe(2);
    expect(tracker.getVelocity()).toBeCloseTo(500, 6);
  });

  it("bounds memory even for bursty input", () => {
    const tracker = new VelocityTracker({ maxSamples: 5, windowMs: 100 });
    for (let index = 0; index < 50; index += 1) {
      tracker.add(index, index);
    }
    expect(tracker.sampleCount).toBe(5);
    expect(tracker.getSamples()).toHaveLength(5);
  });

  it("returns zero for a too-short or nearly stationary sample set", () => {
    const tracker = new VelocityTracker({ minimumDurationMs: 8 });
    tracker.add(5, 0);
    tracker.add(5.001, 4);
    expect(tracker.getVelocity()).toBe(0);
  });

  it("resets for reuse", () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0);
    tracker.add(10, 20);
    tracker.reset();
    expect(tracker.sampleCount).toBe(0);
    expect(tracker.getVelocity()).toBe(0);
    expect(tracker.add(100, 1)).toBe(true);
  });
});
