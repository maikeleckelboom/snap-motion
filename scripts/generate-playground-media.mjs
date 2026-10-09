// Generates the public Playground's gallery plates: six seeded, layered-ridgeline illustrations in
// varied aspect ratios. The output is committed under apps/lab/src/assets/playground-gallery/; run
// this script only to change the plates, never as part of a build:
//
//   node scripts/generate-playground-media.mjs
//
// Every plate is deterministic (fixed seed), self-contained SVG with no external references, so
// the gallery needs no network, licence or font and stays crisp at any zoom level.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(
  new URL("../apps/lab/src/assets/playground-gallery/", import.meta.url),
);

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(random, cells) {
  const values = Array.from({ length: cells + 2 }, () => random());
  return (x) => {
    const index = Math.floor(x);
    const fraction = x - index;
    const eased = fraction * fraction * (3 - 2 * fraction);
    return values[index] * (1 - eased) + values[index + 1] * eased;
  };
}

/** A fractal ridgeline: summed octaves of smoothed value noise, sampled every `step` pixels. */
function ridgePath(random, { width, height, base, amplitude, frequency, sharpness = 0.5 }) {
  const octaves = [0, 1, 2, 3, 4].map((octave) => ({
    gain: sharpness ** octave,
    noise: valueNoise(random, Math.ceil(frequency * 2 ** octave) + 2),
    scale: frequency * 2 ** octave,
  }));
  const totalGain = octaves.reduce((sum, { gain }) => sum + gain, 0);
  const step = Math.max(8, Math.round(width / 220));
  let points = "";
  let peak = base;
  for (let x = 0; x <= width + step; x += step) {
    const clamped = Math.min(x, width);
    const level = octaves.reduce(
      (sum, { gain, noise, scale }) => sum + gain * noise((clamped / width) * scale),
      0,
    );
    const y = base - amplitude * (level / totalGain - 0.35);
    peak = Math.min(peak, y);
    points += `${clamped},${y.toFixed(1)} `;
  }
  return { d: `M0,${height} L${points}L${width},${height}Z`, peak };
}

function grainTile(random, { dark, light, count = 90, size = 128 }) {
  let dots = "";
  for (let index = 0; index < count; index += 1) {
    const x = (random() * size).toFixed(1);
    const y = (random() * size).toFixed(1);
    const radius = (0.5 + random() * 1.1).toFixed(2);
    const tone = index % 2 === 0 ? dark : light;
    dots += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${tone}" fill-opacity="${(0.05 + random() * 0.09).toFixed(3)}"/>`;
  }
  return `<pattern id="grain" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${dots}</pattern>`;
}

function stars(random, { width, height, count, limit }) {
  let dots = "";
  for (let index = 0; index < count; index += 1) {
    const x = (random() * width).toFixed(0);
    const y = (random() * height * limit).toFixed(0);
    const radius = (1 + random() * 2.2).toFixed(1);
    dots += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff" fill-opacity="${(0.25 + random() * 0.65).toFixed(2)}"/>`;
  }
  return dots;
}

function plate({
  seed,
  width,
  height,
  title,
  description,
  sky,
  sun,
  ridges,
  horizon = 0.66,
  mirror = false,
  starCount = 0,
  grain = { dark: "#1c1410", light: "#fff4e0" },
}) {
  const random = createRandom(seed);
  const horizonY = Math.round(height * horizon);
  const defs = [
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${sky
      .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
      .join("")}</linearGradient>`,
    `<radialGradient id="glow"><stop offset="0" stop-color="${sun.color}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${sun.color}" stop-opacity="0.28"/><stop offset="1" stop-color="${sun.color}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.34"/></radialGradient>`,
    grainTile(random, grain),
  ];

  let layers = "";
  let mirrored = "";
  ridges.forEach((ridge, index) => {
    const { d, peak } = ridgePath(random, {
      width,
      height: horizonY + (mirror ? 0 : height - horizonY),
      base: horizonY - ridge.lift * height,
      amplitude: ridge.height * height,
      frequency: ridge.frequency,
      sharpness: ridge.sharpness ?? 0.52,
    });
    defs.push(
      `<linearGradient id="ridge-${index}" gradientUnits="userSpaceOnUse" x1="0" y1="${peak.toFixed(0)}" x2="0" y2="${horizonY}"><stop offset="0" stop-color="${ridge.top}"/><stop offset="1" stop-color="${ridge.bottom}"/></linearGradient>`,
    );
    layers += `<path d="${d}" fill="url(#ridge-${index})"/>`;
    if (mirror) mirrored += `<path d="${d}" fill="url(#ridge-${index})"/>`;
  });

  const sunCircle = `<circle cx="${Math.round(width * sun.x)}" cy="${Math.round(height * sun.y)}" r="${Math.round(Math.min(width, height) * sun.radius)}" fill="${sun.color}"/>`;
  const glow = `<circle cx="${Math.round(width * sun.x)}" cy="${Math.round(height * sun.y)}" r="${Math.round(Math.min(width, height) * sun.radius * 5)}" fill="url(#glow)"/>`;

  // A still surface mirrors the ridges and the sky's last light; the sun itself becomes a vertical
  // shimmer column rather than a second disc.
  const shimmerX = Math.round(width * sun.x);
  const shimmerRadius = Math.round(Math.min(width, height) * sun.radius);
  const ground = mirror
    ? `<rect x="0" y="${horizonY}" width="${width}" height="${height - horizonY}" fill="${mirror.water}"/>` +
      `<g opacity="${mirror.opacity}" transform="translate(0 ${horizonY * 2}) scale(1 -1)">${mirrored}</g>` +
      `<ellipse cx="${shimmerX}" cy="${horizonY + (height - horizonY) * 0.38}" rx="${shimmerRadius * 1.1}" ry="${(height - horizonY) * 0.46}" fill="url(#shimmer)"/>` +
      `<rect x="0" y="${horizonY}" width="${width}" height="${height - horizonY}" fill="url(#water)"/>`
    : "";
  if (mirror) {
    defs.push(
      `<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mirror.water}" stop-opacity="0"/><stop offset="1" stop-color="${mirror.water}" stop-opacity="0.85"/></linearGradient>`,
      `<radialGradient id="shimmer"><stop offset="0" stop-color="${sun.color}" stop-opacity="0.6"/><stop offset="1" stop-color="${sun.color}" stop-opacity="0"/></radialGradient>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title description">`,
    `<title id="title">${title}</title>`,
    `<desc id="description">${description}</desc>`,
    `<defs>${defs.join("")}</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#sky)"/>`,
    starCount > 0 ? stars(random, { width, height: horizonY, count: starCount, limit: 0.85 }) : "",
    glow,
    sunCircle,
    layers,
    ground,
    `<rect width="${width}" height="${height}" fill="url(#grain)"/>`,
    `<rect width="${width}" height="${height}" fill="url(#vignette)"/>`,
    `</svg>`,
  ].join("\n");
}

const plates = {
  "morning-ridge": plate({
    seed: 11,
    width: 2400,
    height: 1600,
    title: "Morning ridge",
    description: "Layered blue ridgelines under a peach dawn sky with a low sun.",
    sky: [
      [0, "#f6c7b6"],
      [0.55, "#fbe3cc"],
      [1, "#fff1dc"],
    ],
    sun: { x: 0.68, y: 0.46, radius: 0.045, color: "#fff6e4" },
    horizon: 0.78,
    ridges: [
      { lift: 0.3, height: 0.2, frequency: 2.2, top: "#e6bfc5", bottom: "#f3d4c6" },
      { lift: 0.22, height: 0.22, frequency: 2.8, top: "#c3a3bd", bottom: "#e0bcc4" },
      { lift: 0.14, height: 0.24, frequency: 3.4, top: "#8f86ac", bottom: "#b79db8" },
      { lift: 0.07, height: 0.24, frequency: 4.2, top: "#5e6a98", bottom: "#8b86ab" },
      { lift: 0.01, height: 0.22, frequency: 5.2, top: "#34456f", bottom: "#4f5d8c" },
    ],
  }),
  "salt-flat-dusk": plate({
    seed: 29,
    width: 2400,
    height: 1600,
    title: "Salt flat at dusk",
    description: "A still salt flat mirroring a violet sky, distant hills and the last light.",
    sky: [
      [0, "#1d2150"],
      [0.5, "#6a3f86"],
      [0.82, "#e0757a"],
      [1, "#fbc07a"],
    ],
    sun: { x: 0.34, y: 0.6, radius: 0.04, color: "#ffe2a6" },
    horizon: 0.62,
    starCount: 90,
    mirror: { water: "#2a2a5c", opacity: 0.55 },
    ridges: [
      { lift: 0.0, height: 0.1, frequency: 3, top: "#7b5a8f", bottom: "#a2698d" },
      { lift: -0.005, height: 0.07, frequency: 4.5, top: "#3f2f6b", bottom: "#5b3f78" },
    ],
    grain: { dark: "#0e0a22", light: "#ffd6c0" },
  }),
  "high-pass": plate({
    seed: 47,
    width: 2400,
    height: 1600,
    title: "High pass",
    description: "Snow-streaked alpine peaks in cold morning haze under a pale blue sky.",
    sky: [
      [0, "#7aa4d6"],
      [0.6, "#c4dcef"],
      [1, "#eaf3f7"],
    ],
    sun: { x: 0.2, y: 0.22, radius: 0.03, color: "#ffffff" },
    horizon: 0.84,
    ridges: [
      {
        lift: 0.42,
        height: 0.34,
        frequency: 1.6,
        top: "#fdfefe",
        bottom: "#b9cde2",
        sharpness: 0.6,
      },
      {
        lift: 0.28,
        height: 0.36,
        frequency: 2.1,
        top: "#eef4f9",
        bottom: "#8ea9c8",
        sharpness: 0.6,
      },
      {
        lift: 0.14,
        height: 0.34,
        frequency: 2.7,
        top: "#9db4cc",
        bottom: "#56718f",
        sharpness: 0.58,
      },
      {
        lift: 0.04,
        height: 0.26,
        frequency: 3.6,
        top: "#3c5875",
        bottom: "#27415a",
        sharpness: 0.55,
      },
    ],
    grain: { dark: "#0f1c2a", light: "#ffffff" },
  }),
  "long-range": plate({
    seed: 83,
    width: 3600,
    height: 1200,
    title: "Long range",
    description: "A three-to-one panorama of overlapping golden-hour ridgelines.",
    sky: [
      [0, "#f1a85b"],
      [0.5, "#f8cf8e"],
      [1, "#fde8c0"],
    ],
    sun: { x: 0.74, y: 0.42, radius: 0.05, color: "#fff8e8" },
    horizon: 0.8,
    ridges: [
      { lift: 0.3, height: 0.26, frequency: 3.2, top: "#f3c797", bottom: "#f8d6a8" },
      { lift: 0.22, height: 0.28, frequency: 4.4, top: "#e5a276", bottom: "#f0bc92" },
      { lift: 0.14, height: 0.28, frequency: 5.6, top: "#c47a64", bottom: "#d99a7c" },
      { lift: 0.07, height: 0.26, frequency: 7, top: "#8e5560", bottom: "#b67470" },
      { lift: 0.0, height: 0.24, frequency: 8.4, top: "#503649", bottom: "#704657" },
    ],
  }),
  "moon-over-ridges": plate({
    seed: 101,
    width: 1600,
    height: 2400,
    title: "Moon over the ridges",
    description: "A tall night scene: a pale moon and stars above stacked teal ridgelines.",
    sky: [
      [0, "#0a1830"],
      [0.55, "#16405a"],
      [1, "#3f8a91"],
    ],
    sun: { x: 0.62, y: 0.24, radius: 0.07, color: "#f4f6e6" },
    horizon: 0.86,
    starCount: 160,
    ridges: [
      { lift: 0.36, height: 0.12, frequency: 2.6, top: "#4f9a9c", bottom: "#78b3ae" },
      { lift: 0.27, height: 0.13, frequency: 3.2, top: "#2f7d86", bottom: "#4f9a9c" },
      { lift: 0.18, height: 0.13, frequency: 3.9, top: "#1f5f6f", bottom: "#2f7d86" },
      { lift: 0.09, height: 0.13, frequency: 4.6, top: "#14465a", bottom: "#1f5f6f" },
      { lift: 0.01, height: 0.12, frequency: 5.4, top: "#0b2c40", bottom: "#14465a" },
    ],
    grain: { dark: "#02080f", light: "#d8f2f0" },
  }),
  "ember-dunes": plate({
    seed: 137,
    width: 2000,
    height: 2000,
    title: "Ember dunes",
    description: "Soft, sharply lit desert dunes in warm amber and rust under a hazy sun.",
    sky: [
      [0, "#e9a56c"],
      [0.6, "#f6d1a0"],
      [1, "#fbe6c4"],
    ],
    sun: { x: 0.3, y: 0.3, radius: 0.06, color: "#fff4d8" },
    horizon: 0.78,
    ridges: [
      {
        lift: 0.3,
        height: 0.1,
        frequency: 1.4,
        top: "#e7b17e",
        bottom: "#f1c598",
        sharpness: 0.35,
      },
      {
        lift: 0.22,
        height: 0.12,
        frequency: 1.8,
        top: "#d8935f",
        bottom: "#e6ae7c",
        sharpness: 0.35,
      },
      {
        lift: 0.13,
        height: 0.14,
        frequency: 2.2,
        top: "#b8683f",
        bottom: "#d08652",
        sharpness: 0.35,
      },
      {
        lift: 0.05,
        height: 0.16,
        frequency: 2.6,
        top: "#8a4a33",
        bottom: "#a85f3d",
        sharpness: 0.35,
      },
      {
        lift: -0.02,
        height: 0.16,
        frequency: 3,
        top: "#5b3226",
        bottom: "#7a4631",
        sharpness: 0.35,
      },
    ],
    grain: { dark: "#2a120a", light: "#fff0d6" },
  }),
};

mkdirSync(outputDirectory, { recursive: true });
for (const [name, svg] of Object.entries(plates)) {
  writeFileSync(join(outputDirectory, `${name}.svg`), `${svg}\n`);
  process.stdout.write(`${name}.svg ${(svg.length / 1024).toFixed(1)} KiB\n`);
}
