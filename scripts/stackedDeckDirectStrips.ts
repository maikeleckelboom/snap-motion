import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Cuts high-density contact strips out of a Direct visual recording, one per marked release.
 *
 * A two-frame-per-second overview cannot review a one-frame defect. Each strip is every frame the
 * recording actually holds from a quarter of a second before the hand let go to half a second
 * after, tiled in reading order, so a depth swap or a material replacement has nowhere to hide
 * between two tiles.
 *
 * Releases are found in the recording rather than by clock, because the video's own timeline starts
 * at the page's first paint and no container timestamp can name a frame across that gap. The
 * harness flashes a corner of the page white on the frame it releases; the strip is cut around it.
 *
 * Usage: node scripts/stackedDeckDirectStrips.ts [candidate] [--before=ms] [--after=ms]
 */
const repoRoot = resolve(import.meta.dirname, "..");
const argument = (name: string, fallback: number): number => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  const parsed = match === undefined ? Number.NaN : Number(match.slice(name.length + 3));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const candidate = process.argv[2]?.startsWith("--")
  ? "production"
  : (process.argv[2] ?? "production");
const beforeMs = argument("before", 250);
const afterMs = argument("after", 500);

const candidateDirectory = resolve(repoRoot, ".artifacts", "stacked-deck-direct-review", candidate);
const revisions = readdirSync(candidateDirectory)
  .map((entry) => join(candidateDirectory, entry))
  .filter((path) => statSync(path).isDirectory())
  .toSorted((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);
const latest = revisions.at(-1);
if (latest === undefined) throw new Error(`No Direct visual revision recorded under ${candidate}.`);

const metrics = JSON.parse(readFileSync(join(latest, "metrics.json"), "utf8")) as {
  releases?: readonly string[];
  viewport?: { readonly height: number; readonly width: number } | null;
};
const releases = metrics.releases ?? [];
if (releases.length === 0) {
  throw new Error("The recording marked no releases, so there is nothing to cut a strip around.");
}

const recording = join(latest, "recording.webm");

const MARKER_SIZE = 28;

function runFfmpeg(args: readonly string[]): string {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 * 1_024 * 1_024 });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.split("\n").slice(-4).join(" ")}`);
  }
  return `${result.stdout}${result.stderr}`;
}

/**
 * The marker's own square inside the recording.
 *
 * The recording scales the page to fit its frame from the frame's own origin, so the marker is in
 * the corner — but it is only as many frame pixels across as that scale left it, and the sample is
 * inset from its edges so nothing but marker is ever averaged.
 */
function markerCrop(): string {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      recording,
    ],
    { encoding: "utf8" },
  );
  const [frameWidth = 0, frameHeight = 0] = probe.stdout.trim().split(",").map(Number);
  const page = metrics.viewport ?? { height: frameHeight, width: frameWidth };
  const scale = Math.min(frameWidth / page.width, frameHeight / page.height);
  const size = Math.max(4, Math.round(MARKER_SIZE * scale) - 8);
  return `crop=${size}:${size}:4:4`;
}

/** Media timestamps of the frames where the harness' release marker flashes on. */
function markedReleaseTimes(): readonly number[] {
  const report = runFfmpeg([
    "-i",
    recording,
    "-vf",
    `${markerCrop()},signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
    "-f",
    "null",
    "-",
  ]);
  const times: number[] = [];
  // Bright to begin with, because the page is white where the marker has not been injected yet:
  // the frames before it exists are not a release.
  let previousLuma = 255;
  let pendingTime: number | undefined;
  for (const line of report.split("\n")) {
    const frame = /pts_time:(?<time>[\d.]+)/u.exec(line);
    if (frame?.groups?.["time"] !== undefined) {
      pendingTime = Number(frame.groups["time"]);
      continue;
    }
    const luma = /YAVG=(?<value>[\d.]+)/u.exec(line);
    if (luma?.groups?.["value"] === undefined || pendingTime === undefined) continue;
    const value = Number(luma.groups["value"]);
    if (value > 128 && previousLuma <= 128) times.push(pendingTime);
    previousLuma = value;
  }
  return times;
}

const times = markedReleaseTimes();
if (times.length !== releases.length) {
  throw new Error(
    `The recording holds ${times.length} release markers for ${releases.length} releases.`,
  );
}

for (const [index, name] of releases.entries()) {
  const at = times[index]!;
  const output = join(latest, `strip-${name}.png`);
  const from = Math.max(0, at - beforeMs / 1_000);
  runFfmpeg([
    "-y",
    "-v",
    "error",
    "-i",
    recording,
    "-fps_mode",
    "passthrough",
    "-vf",
    `select='between(t,${from.toFixed(3)},${(at + afterMs / 1_000).toFixed(3)})',setpts=N/25/TB,scale=420:-1,tile=5x4:padding=4:color=0x1f2937`,
    "-frames:v",
    "1",
    output,
  ]);
  process.stdout.write(`${name} at ${at.toFixed(3)}s -> ${output}\n`);
}
