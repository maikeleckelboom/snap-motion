import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  studyCategories,
  studyDefinitions,
  type StudyDefinition,
} from "../apps/lab/src/playground/studio/studies.ts";

/**
 * Original, deterministic plates for the Motion Studio: three per study (the cover, its route and an
 * illustrative timing curve). Run `node scripts/generateStudioPlates.ts` only to change them; the
 * output is committed under `apps/lab/src/assets/studio/` and no build depends on this script.
 *
 * Everything is vector data with no remote references. The routes and curves are drawn to show the
 * character of each study. They are illustrations, never measurements, and the plates say so.
 */
const target = resolve(import.meta.dirname, "../apps/lab/src/assets/studio");
mkdirSync(target, { recursive: true });

const paper = "#f6f3ea";
const ink = "#232527";
const muted = "#66695f";
const rust = "#b84924";
const line = "#d8d2c5";

const n = (value: number) => Number(value.toFixed(1));
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, extra = "") =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${fill}"${extra}/>`;
const circle = (x: number, y: number, radius: number, fill: string, extra = "") =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="${fill}"${extra}/>`;
const stroke = (d: string, color: string, width: number, extra = "") =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const text = (
  x: number,
  y: number,
  content: string,
  size: number,
  fill = ink,
  weight = 400,
  extra = "",
) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${fill}" font-weight="${weight}"${extra}>${content}</text>`;

const escapeXml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const parseHex = (value: string) =>
  [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));

function mix(color: string, other: string, amount: number) {
  const [a, b] = [parseHex(color), parseHex(other)] as [number[], number[]];
  return `#${a
    .map((channel, index) =>
      Math.round(channel + (b[index]! - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

type Point = readonly [number, number];
const polyline = (points: readonly Point[]) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${n(x)} ${n(y)}`).join(" ");

/** Catmull-Rom through the points, as cubic Béziers, for routes that should read as one gesture. */
function smooth(points: readonly Point[]) {
  let d = `M${n(points[0]![0])} ${n(points[0]![1])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** Underdamped (or critically damped) response sampled as a polyline from `from` to `to`. */
function dampedCurve(
  x0: number,
  x1: number,
  rest: number,
  amplitude: number,
  decay: number,
  turns: number,
) {
  const points: Point[] = [];
  for (let step = 0; step <= 160; step += 1) {
    const t = step / 160;
    points.push([
      x0 + (x1 - x0) * t,
      rest - amplitude * Math.exp(-decay * t) * Math.cos(2 * Math.PI * turns * t),
    ]);
  }
  return points;
}

// ---------------------------------------------------------------------------------------- cover

/** Each motif is drawn inside an 800 x 380 field whose origin is (100, 80) on the 1000 x 700 plate. */
const motifs: Record<string, (soft: string) => string> = {
  orbit: (soft) =>
    [
      circle(500, 270, 150, "none", ` stroke="${ink}" stroke-opacity="0.35" stroke-width="4"`),
      circle(470, 280, 112, ink),
      circle(538, 232, 84, soft),
      circle(623, 184, 22, rust),
    ].join(""),
  traverse: (soft) =>
    [
      stroke(
        polyline([
          [150, 395],
          [290, 150],
          [430, 395],
          [570, 150],
          [710, 395],
          [850, 175],
        ]),
        ink,
        24,
      ),
      [150, 290, 430, 570, 710]
        .map((x, index) => circle(x, index % 2 === 0 ? 395 : 150, 10, soft))
        .join(""),
      circle(850, 175, 32, rust),
    ].join(""),
  fold: (soft) =>
    [
      rect(310, 90, 260, 260, ink, 14),
      rect(440, 170, 270, 215, soft, 14),
      stroke("M444 172 L706 382", rust, 10),
    ].join(""),
  relay: (soft) =>
    [
      stroke("M200 270 H730", rust, 12),
      circle(200, 270, 104, ink),
      circle(385, 270, 84, ink),
      circle(560, 270, 64, ink),
      circle(720, 270, 46, rust),
      circle(560, 270, 26, soft),
    ].join(""),
  drift: (soft) =>
    [
      stroke(
        smooth([
          [130, 340],
          [260, 160],
          [400, 250],
          [540, 340],
          [690, 190],
          [820, 220],
        ]),
        ink,
        4,
        ` stroke-opacity="0.35" stroke-dasharray="3 14"`,
      ),
      circle(150, 335, 48, ink),
      circle(262, 175, 26, soft),
      circle(360, 215, 17, ink),
      circle(470, 305, 34, soft, ` stroke="${ink}" stroke-width="4"`),
      circle(575, 345, 21, ink),
      circle(690, 195, 54, ink),
      circle(822, 222, 24, rust),
    ].join(""),
  return: () =>
    [
      stroke("M120 270 H880", rust, 6),
      stroke(polyline(dampedCurve(130, 870, 270, 190, 3.4, 2.5)), ink, 14),
      circle(130, 80, 24, ink),
    ].join(""),
  arc: () =>
    [330, 250, 170, 90]
      .map((radius, index) =>
        stroke(
          `M${350 + radius} 450 A${radius} ${radius} 0 0 0 350 ${450 - radius}`,
          ink,
          18 - index * 2,
        ),
      )
      .join("") + circle(350, 120, 28, rust),
  spiral: () => {
    const points: Point[] = [];
    for (let step = 0; step <= 220; step += 1) {
      const t = step / 220;
      const angle = Math.PI * 2 * 2.5 * t;
      const radius = 200 * (1 - t) + 4;
      points.push([500 + radius * Math.cos(angle), 270 + radius * Math.sin(angle)]);
    }
    return stroke(polyline(points), ink, 16) + circle(500, 270, 24, rust);
  },
  step: (soft) =>
    [0, 1, 2, 3, 4]
      .map((index) => {
        const height = 80 + index * 62;
        return rect(
          140 + index * 128,
          450 - height,
          112,
          height,
          index === 3 ? rust : index % 2 === 0 ? ink : soft,
          6,
        );
      })
      .join(""),
  pivot: (soft) =>
    [
      `<g transform="rotate(0 330 400)">${rect(330, 355, 390, 90, soft, 10, ` fill-opacity="0.7"`)}</g>`,
      `<g transform="rotate(-28 330 400)">${rect(330, 355, 390, 90, soft, 10)}</g>`,
      `<g transform="rotate(-58 330 400)">${rect(330, 355, 390, 90, ink, 10)}</g>`,
      circle(330, 400, 28, rust),
    ].join(""),
  cascade: (soft) =>
    [0, 1, 2, 3, 4]
      .map((index) =>
        rect(
          120 + index * 52,
          105 + index * 74,
          540,
          54,
          index === 2 ? rust : index % 2 === 0 ? ink : soft,
          8,
        ),
      )
      .join(""),
  settle: (soft) =>
    [
      circle(500, 270, 200, "none", ` stroke="${ink}" stroke-opacity="0.25" stroke-width="4"`),
      circle(500, 270, 154, "none", ` stroke="${ink}" stroke-opacity="0.45" stroke-width="7"`),
      circle(500, 270, 110, "none", ` stroke="${ink}" stroke-opacity="0.7" stroke-width="12"`),
      circle(500, 270, 70, "none", ` stroke="${ink}" stroke-width="18"`),
      circle(500, 270, 34, rust),
      circle(500, 270, 12, soft),
    ].join(""),
};

function coverPlate(study: StudyDefinition, index: number) {
  const soft = mix(study.tone, "#ffffff", 0.55);
  const number = String(index + 1).padStart(2, "0");
  const categoryLabel = studyCategories.find(({ id }) => id === study.category)!.label;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(`${study.name} study plate: ${study.motif}`)}">
  <style>text{font-family:Arial,Helvetica,sans-serif} .mono{font-family:Consolas,monospace;letter-spacing:3px}</style>
  ${rect(0, 0, 1000, 700, study.tone)}
  ${text(60, 74, `${number} / STUDY`, 24, ink, 400, ' class="mono"')}${text(940, 74, categoryLabel.toUpperCase(), 24, ink, 400, ' class="mono" text-anchor="end"')}
  <g transform="translate(100 80)">${motifs[study.id]!(soft)}</g>
  ${text(60, 604, escapeXml(study.name), 92, ink, 700)}${text(63, 652, escapeXml(study.kind), 30, mix(ink, study.tone, 0.3))}
  ${circle(920, 622, 11, rust)}
</svg>
`;
}

// ------------------------------------------------------------------------- inspection plates

function shell(study: StudyDefinition, index: number, section: string, body: string) {
  const number = String(index + 1).padStart(2, "0");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1000 625" role="img" aria-label="${escapeXml(`Snap Motion — ${study.name} ${section.toLowerCase()}`)}">
  <style>text{font-family:Arial,Helvetica,sans-serif} .mono{font-family:Consolas,monospace;letter-spacing:2px}</style>
  ${rect(0, 0, 1000, 625, paper)}
  ${rect(28, 24, 40, 40, ink, 8)}${text(35, 50, "SM", 17, paper, 700)}
  ${text(82, 49, "SNAP MOTION", 20, ink, 700)}${text(262, 49, "/ STUDIO", 17, muted)}
  ${text(780, 49, `${number} / ${String(studyDefinitions.length).padStart(2, "0")}`, 18, ink)}${circle(935, 44, 5, rust)}
  ${rect(28, 82, 944, 1, line)}
  ${text(30, 137, escapeXml(study.name), 42, ink, 700)}${text(30, 173, `${section} / ${escapeXml(study.kind)}`, 21, muted)}
  ${body}
  ${rect(28, 579, 944, 1, line)}
  ${text(30, 606, "MOTION STUDIES", 14, muted)}${text(785, 606, `SNAP / ${number}`, 14, ink)}
</svg>
`;
}

/** A route drawn inside a 600 x 300 box, plus its labelled anchors. */
const routes: Record<string, { d: string; anchors: readonly Point[] }> = {
  orbit: {
    d: "M405 150 A105 105 0 1 1 195 150 A105 105 0 1 1 405 150",
    anchors: [
      [405, 150],
      [300, 255],
      [195, 150],
      [300, 45],
    ],
  },
  traverse: {
    d: polyline([
      [30, 260],
      [150, 50],
      [270, 260],
      [390, 50],
      [510, 250],
      [570, 70],
    ]),
    anchors: [
      [30, 260],
      [150, 50],
      [270, 260],
      [390, 50],
      [510, 250],
      [570, 70],
    ],
  },
  fold: {
    d: polyline([
      [60, 245],
      [300, 245],
      [420, 60],
      [550, 60],
    ]),
    anchors: [
      [60, 245],
      [300, 245],
      [420, 60],
      [550, 60],
    ],
  },
  relay: {
    d: smooth([
      [60, 210],
      [200, 90],
      [340, 210],
      [480, 90],
      [560, 160],
    ]),
    anchors: [
      [60, 210],
      [200, 90],
      [340, 210],
      [480, 90],
      [560, 160],
    ],
  },
  drift: {
    d: smooth([
      [40, 200],
      [140, 80],
      [250, 170],
      [350, 60],
      [450, 190],
      [560, 110],
    ]),
    anchors: [
      [40, 200],
      [560, 110],
    ],
  },
  return: {
    d: polyline(dampedCurve(40, 560, 150, 110, 3.4, 2.5)),
    anchors: [
      [40, 40],
      [560, 150],
    ],
  },
  arc: {
    d: "M80 260 A230 230 0 0 1 310 30",
    anchors: [
      [80, 260],
      [310, 30],
    ],
  },
  spiral: {
    d: (() => {
      const points: Point[] = [];
      for (let step = 0; step <= 200; step += 1) {
        const t = step / 200;
        const angle = Math.PI * 2 * 2.5 * t;
        const radius = 125 * (1 - t) + 3;
        points.push([300 + radius * Math.cos(angle), 150 + radius * Math.sin(angle)]);
      }
      return polyline(points);
    })(),
    anchors: [
      [425, 150],
      [300, 150],
    ],
  },
  step: {
    d: "M40 260 H140 V200 H240 V140 H340 V80 H440 V30 H560",
    anchors: [
      [140, 260],
      [240, 200],
      [340, 140],
      [440, 80],
      [560, 30],
    ],
  },
  pivot: {
    d: "M380 240 A260 260 0 0 0 250 15 M120 240 L380 240 M120 240 L250 15",
    anchors: [
      [120, 240],
      [380, 240],
      [250, 15],
    ],
  },
  cascade: {
    d: [0, 1, 2, 3, 4]
      .map((lane) => `M${60 + lane * 40} ${45 + lane * 50} H${440 + lane * 40}`)
      .join(" "),
    anchors: [0, 1, 2, 3, 4].map((lane): Point => [440 + lane * 40, 45 + lane * 50]),
  },
  settle: {
    d: "M410 150 A110 110 0 1 1 190 150 A110 110 0 1 1 410 150 M370 150 A70 70 0 1 1 230 150 A70 70 0 1 1 370 150 M336 150 A36 36 0 1 1 264 150 A36 36 0 1 1 336 150",
    anchors: [[300, 150]],
  },
};

function routePlate(study: StudyDefinition, index: number) {
  const route = routes[study.id]!;
  const origin = { x: 52, y: 225 };
  const grid =
    Array.from({ length: 14 }, (_, i) => stroke(`M${30 + i * 46} 203 V547`, line, 1)).join("") +
    Array.from({ length: 8 }, (_, i) => stroke(`M30 ${203 + i * 49} H674`, line, 1)).join("");
  const labels = "ABCDEF";
  const anchors = route.anchors
    .map(([x, y], anchorIndex) => {
      const cx = origin.x + x;
      const cy = origin.y + y;
      return `${circle(cx, cy, 11, ink)}${circle(cx, cy, 4, paper)}${text(cx + 16, cy - 14, labels[anchorIndex] ?? "", 17, ink, 700, ' class="mono"')}`;
    })
    .join("");
  const attributes = study.attributes
    .map((attribute, row) => {
      const y = 276 + row * 54;
      return `${rect(710, y - 22, 258, 1, line)}${text(710, y, escapeXml(attribute.label.toUpperCase()), 13, muted, 400, ' class="mono"')}${text(710, y + 24, escapeXml(attribute.value), 20, ink, 700)}`;
    })
    .join("");
  return shell(
    study,
    index,
    "Route",
    `${rect(30, 203, 644, 344, "#e8e3d9", 8)}${grid}
  <g transform="translate(${origin.x} ${origin.y})">${stroke(route.d, rust, 5)}</g>
  ${anchors}
  ${text(710, 231, "STUDY ATTRIBUTES", 15, muted)}${attributes}
  ${rect(710, 497, 260, 50, "#e4ded1", 6)}${text(726, 528, "ILLUSTRATIVE ROUTE", 14, ink, 700, ' class="mono"')}`,
  );
}

type Curve = (t: number) => number;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut: Curve = (t) => 1 - (1 - t) ** 3;
const easeInOut: Curve = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const damped =
  (decay: number, turns: number): Curve =>
  (t) =>
    1 - Math.exp(-decay * t) * Math.cos(2 * Math.PI * turns * t);
const smoothstep: Curve = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** Four handoffs, each one easing in and out before the next begins. */
const staged: Curve = (t) => {
  const stage = Math.min(3, Math.floor(t * 4));
  return (stage + easeInOut(clamp01(t * 4 - stage))) / 4;
};
/** Four quick rises with a clear rest between them. */
const stepped: Curve = (t) =>
  [0.2, 0.4, 0.6, 0.8].reduce((sum, edge) => sum + smoothstep((t - (edge - 0.03)) / 0.06) / 4, 0);

const curves: Record<string, readonly Curve[]> = {
  orbit: [easeInOut],
  traverse: [easeOut],
  fold: [easeInOut],
  relay: [staged],
  drift: [(t) => 1 - Math.exp(-2.6 * t)],
  return: [damped(3.4, 1.25)],
  arc: [easeOut],
  spiral: [(t) => 1 - (1 - t) ** 2],
  step: [stepped],
  pivot: [easeInOut],
  cascade: [0, 1, 2, 3, 4].map(
    (lane): Curve =>
      (t) =>
        easeInOut(clamp01((t - lane * 0.1) / 0.6)),
  ),
  settle: [(t) => 1 - Math.exp(-4.2 * t) * (1 + 4.2 * t)],
};

function timingPlate(study: StudyDefinition, index: number) {
  const panel = { x: 30, y: 203, w: 644, h: 344 };
  const plot = { x: panel.x + 54, y: panel.y + 30, w: panel.w - 84, h: panel.h - 84 };
  const toX = (t: number) => plot.x + plot.w * t;
  const toY = (value: number) => plot.y + plot.h * (1 - (value + 0.12) / 1.5);
  const rows = curves[study.id]!;
  const traces = rows
    .map((curve, row) => {
      const points: Point[] = [];
      for (let step = 0; step <= 160; step += 1) {
        const t = step / 160;
        points.push([toX(t), toY(curve(t))]);
      }
      return stroke(
        polyline(points),
        row === Math.floor(rows.length / 2) ? rust : ink,
        row === Math.floor(rows.length / 2) ? 5 : 3,
        rows.length > 1
          ? ` stroke-opacity="${row === Math.floor(rows.length / 2) ? 1 : 0.55}"`
          : "",
      );
    })
    .join("");
  const bands = ["RELEASE", "TRAVEL", "REST"]
    .map((label, band) => {
      const x = toX(band === 0 ? 0 : band === 1 ? 0.18 : 0.72);
      const width = toX(band === 0 ? 0.18 : band === 1 ? 0.72 : 1) - x;
      return `${rect(x, plot.y + plot.h + 14, width - 2, 24, band === 1 ? "#d8d2c5" : "#e4ded1", 4)}${text(x + width / 2, plot.y + plot.h + 31, label, 12, ink, 700, ' class="mono" text-anchor="middle"')}`;
    })
    .join("");
  return shell(
    study,
    index,
    "Timing",
    `${rect(panel.x, panel.y, panel.w, panel.h, "#e8e3d9", 8)}
  ${[0, 1].map((tick) => stroke(`M${plot.x} ${toY(tick)} H${plot.x + plot.w}`, line, 1.5, tick === 1 ? ` stroke-dasharray="6 6"` : "")).join("")}
  ${stroke(`M${plot.x} ${plot.y} V${plot.y + plot.h}`, muted, 2)}${stroke(`M${plot.x} ${toY(0)} H${plot.x + plot.w}`, muted, 2)}
  ${text(plot.x + 10, toY(1) - 9, "TARGET", 12, muted, 400, ' class="mono"')}${text(plot.x + 10, toY(0) + 20, "START", 12, muted, 400, ' class="mono"')}
  ${traces}${bands}
  ${text(710, 231, "READING THE CURVE", 15, muted)}
  ${text(710, 282, escapeXml(study.kind), 26, ink, 700)}
  ${[
    "Height is progress toward",
    "the rest position.",
    "Width is time, from release",
    "to rest.",
    "Drawn for character, not",
    "taken from a measurement.",
  ]
    .map((sentence, row) => text(710, 322 + row * 24, sentence, 15, muted))
    .join("")}
  ${rect(710, 497, 260, 50, "#e4ded1", 6)}${text(726, 528, "ILLUSTRATIVE CURVE", 14, ink, 700, ' class="mono"')}`,
  );
}

studyDefinitions.forEach((study, index) => {
  writeFileSync(resolve(target, `${study.id}-cover.svg`), coverPlate(study, index));
  writeFileSync(resolve(target, `${study.id}-route.svg`), routePlate(study, index));
  writeFileSync(resolve(target, `${study.id}-timing.svg`), timingPlate(study, index));
});
process.stdout.write(`Generated ${studyDefinitions.length * 3} study plates in ${target}\n`);
