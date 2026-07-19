import { assertFiniteNumber, assertNonNegative } from "./bounds";

export interface VelocitySample {
  readonly position: number;
  readonly timestampMs: number;
}

export interface VelocityTrackerOptions {
  readonly windowMs?: number;
  readonly maxSamples?: number;
  readonly recencyWeight?: number;
  readonly minimumDurationMs?: number;
}

const DEFAULT_WINDOW_MS = 80;
const DEFAULT_MAX_SAMPLES = 12;
const DEFAULT_RECENCY_WEIGHT = 2;
const DEFAULT_MINIMUM_DURATION_MS = 8;

export class VelocityTracker {
  readonly #windowMs: number;
  readonly #maxSamples: number;
  readonly #recencyWeight: number;
  readonly #minimumDurationMs: number;
  readonly #samples: VelocitySample[] = [];

  constructor(options: VelocityTrackerOptions = {}) {
    this.#windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.#maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.#recencyWeight = options.recencyWeight ?? DEFAULT_RECENCY_WEIGHT;
    this.#minimumDurationMs = options.minimumDurationMs ?? DEFAULT_MINIMUM_DURATION_MS;

    assertFiniteNumber(this.#windowMs, "windowMs");
    assertFiniteNumber(this.#maxSamples, "maxSamples");
    assertNonNegative(this.#recencyWeight, "recencyWeight");
    assertNonNegative(this.#minimumDurationMs, "minimumDurationMs");

    if (this.#windowMs <= 0) {
      throw new RangeError("windowMs must be greater than zero");
    }
    if (!Number.isInteger(this.#maxSamples) || this.#maxSamples < 2) {
      throw new RangeError("maxSamples must be an integer greater than or equal to two");
    }
  }

  get sampleCount(): number {
    return this.#samples.length;
  }

  add(position: number, timestampMs: number): boolean {
    if (!Number.isFinite(position) || !Number.isFinite(timestampMs)) {
      return false;
    }

    const previous = this.#samples.at(-1);
    if (previous && timestampMs <= previous.timestampMs) {
      return false;
    }

    this.#samples.push({ position, timestampMs });
    this.#prune(timestampMs);
    return true;
  }

  getVelocity(): number {
    if (this.#samples.length < 2) {
      return 0;
    }

    const latest = this.#samples.at(-1)!;
    const earliest = this.#samples[0]!;
    const durationMs = latest.timestampMs - earliest.timestampMs;
    if (durationMs < this.#minimumDurationMs) {
      return 0;
    }

    let totalWeight = 0;
    let weightedTime = 0;
    let weightedPosition = 0;

    for (const sample of this.#samples) {
      const age = latest.timestampMs - sample.timestampMs;
      const recency = 1 - Math.min(1, age / this.#windowMs);
      const weight = 1 + this.#recencyWeight * recency;
      const relativeTime = sample.timestampMs - latest.timestampMs;
      totalWeight += weight;
      weightedTime += relativeTime * weight;
      weightedPosition += sample.position * weight;
    }

    const meanTime = weightedTime / totalWeight;
    const meanPosition = weightedPosition / totalWeight;
    let covariance = 0;
    let variance = 0;

    for (const sample of this.#samples) {
      const age = latest.timestampMs - sample.timestampMs;
      const recency = 1 - Math.min(1, age / this.#windowMs);
      const weight = 1 + this.#recencyWeight * recency;
      const timeDelta = sample.timestampMs - latest.timestampMs - meanTime;
      covariance += weight * timeDelta * (sample.position - meanPosition);
      variance += weight * timeDelta * timeDelta;
    }

    return variance === 0 ? 0 : (covariance / variance) * 1000;
  }

  getSamples(): readonly VelocitySample[] {
    return this.#samples.map((sample) => ({ ...sample }));
  }

  reset(): void {
    this.#samples.length = 0;
  }

  #prune(latestTimestampMs: number): void {
    const cutoff = latestTimestampMs - this.#windowMs;
    const firstInsideWindow = this.#samples.findIndex((sample) => sample.timestampMs >= cutoff);

    // Keep the nearest preceding sample so sparse input still has a meaningful slope.
    if (firstInsideWindow > 1) {
      this.#samples.splice(0, firstInsideWindow - 1);
    }

    if (this.#samples.length > this.#maxSamples) {
      this.#samples.splice(0, this.#samples.length - this.#maxSamples);
    }
  }
}
