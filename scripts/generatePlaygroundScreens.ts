import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Original, deterministic software plates. All text and geometry remain editable vector data. */
const target = resolve(import.meta.dirname, "../apps/lab/src/assets/playground-screens");
mkdirSync(target, { recursive: true });

const paper = "#f6f3ea";
const ink = "#232527";
const muted = "#66695f";
const orange = "#b84924";
const highlight = "#e7b48d";
const line = "#d8d2c5";
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const text = (x: number, y: number, content: string, size = 20, fill = ink, weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${content}</text>`;
const rule = (x: number, y: number, w: number, color = line) => rect(x, y, w, 1, color);
const circle = (x: number, y: number, radius: number, fill: string) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"/>`;
const path = (d: string, stroke: string, width = 3) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

function shell(title: string, index: string, body: string, dark = false) {
  const fg = dark ? paper : ink;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1000 625" role="img" aria-label="Snap Motion — ${title}">
  <style>text{font-family:Arial,Helvetica,sans-serif} .mono{font-family:Consolas,monospace;letter-spacing:2px}</style>
  ${rect(0, 0, 1000, 625, dark ? ink : paper)}
  ${rect(28, 24, 40, 40, dark ? highlight : ink, 8)}${text(35, 50, "SM", 17, dark ? ink : paper, 700)}
  ${text(82, 49, "SNAP MOTION", 20, fg, 700)}${text(262, 49, "/ STUDIO", 17, dark ? "#bdc1c3" : muted)}
  ${text(780, 49, `${index} / 05`, 18, fg)}${circle(935, 44, 5, dark ? highlight : orange)}
  ${rule(28, 82, 944, dark ? "#484b4c" : line)}
  ${body}
  ${rule(28, 579, 944, dark ? "#484b4c" : line)}
  ${text(30, 606, "MOTION STUDIES", 14, dark ? "#bdc1c3" : muted)}${text(785, 606, `SNAP / ${index}`, 14, fg)}
  </svg>`;
}

const names = ["Orbit", "Traverse", "Fold", "Relay", "Drift", "Return"];
const motifs = names
  .map((name, index) => {
    const x = 30 + (index % 3) * 318;
    const y = 203 + Math.floor(index / 3) * 181;
    const colors = ["#e6b091", "#e4ded1", "#cbd3d9", "#ded4bb", "#d9ccc8", "#bec9d0"];
    const drawing =
      index % 3 === 0
        ? `${circle(x + 149, y + 61, 42, ink)}${circle(x + 172, y + 46, 30, colors[index]!)}${circle(x + 120, y + 84, 9, orange)}`
        : index % 3 === 1
          ? `${path(`M${x + 68} ${y + 90} L${x + 113} ${y + 32} L${x + 173} ${y + 90} L${x + 218} ${y + 32}`, ink, 11)}${circle(x + 218, y + 32, 10, orange)}`
          : `${rect(x + 81, y + 20, 85, 85, ink, 5)}${rect(x + 129, y + 42, 85, 65, colors[index]!, 5)}${path(`M${x + 131} ${y + 42} L${x + 213} ${y + 107}`, orange, 4)}`;
    return `${rect(x, y, 302, 166, colors[index]!, 8)}${drawing}${text(x + 18, y + 143, name, 24, ink, 700)}${text(x + 235, y + 143, String(index + 1).padStart(2, "0"), 17, muted)}`;
  })
  .join("");
writeFileSync(
  resolve(target, "collectionLibrary.svg"),
  shell(
    "Collection library",
    "01",
    `${text(30, 137, "Collection library", 42, ink, 700)}${text(30, 173, "Six studies in movement. One common language.", 21, muted)}${text(787, 139, "ALL STUDIES ↓", 17, orange, 700)}${motifs}`,
  ),
);

const tracks = ["Position", "Scale", "Rotation"]
  .map((label, i) => {
    const y = 294 + i * 77;
    return `${text(32, y + 30, label, 20, paper)}${rect(178, y, 790, 56, "#343638", 5)}
  ${Array.from({ length: 5 }, (_, j) => rect(197 + j * 149, y + 14, 117 - i * 19, 28, [highlight, "#dcb68a", "#a5bdcc"][i]!, 4)).join("")}`;
  })
  .join("");
writeFileSync(
  resolve(target, "sequenceEditor.svg"),
  shell(
    "Sequence editor",
    "02",
    `${text(30, 139, "Sequence editor", 42, paper, 700)}${text(30, 175, "Traverse / Three properties, one transition", 21, "#bdc1c3")}
  ${rect(730, 108, 240, 88, "#343638", 8)}${text(752, 136, "DURATION", 14, highlight)}${text(752, 178, "1.20 s", 36, paper, 700)}
  ${rule(30, 219, 940, "#484b4c")}${["0.00", "0.30", "0.60", "0.90", "1.20"].map((t, i) => text(178 + i * 172, 264, t, 17, "#bdc1c3")).join("")}${tracks}
  ${path("M609 240 V531", orange, 3)}${circle(609, 239, 6, orange)}${text(32, 547, "●   PLAYHEAD 0.72 s", 16, highlight)}${text(735, 547, "3 TRACKS / 15 KEYS", 16, "#bdc1c3")}`,
    true,
  ),
);

const atlasGrid =
  Array.from({ length: 15 }, (_, i) => path(`M${30 + i * 44} 203 V547`, line, 1)).join("") +
  Array.from({ length: 9 }, (_, i) => path(`M30 ${203 + i * 43} H674`, line, 1)).join("");
writeFileSync(
  resolve(target, "motionAtlas.svg"),
  shell(
    "Motion atlas",
    "03",
    `${text(30, 137, "Motion atlas", 42, ink, 700)}${text(30, 173, "A field guide to spatial relationships", 21, muted)}
  ${rect(30, 203, 644, 344, "#e8e3d9", 8)}${atlasGrid}
  ${path("M88 470 C90 390 217 479 265 359 S383 249 462 314 S567 431 615 259", orange, 5)}
  ${circle(265, 359, 14, orange)}${circle(462, 314, 9, ink)}${circle(615, 259, 9, ink)}
  ${rect(99, 226, 127, 82, "#fffdf7", 5)}${text(118, 254, "ORIGIN", 14, muted)}${text(118, 287, "x 0 / y 0", 21, ink, 700)}
  ${rect(355, 411, 220, 89, ink, 7)}${text(375, 440, "03 / TRAVERSE", 15, highlight)}${text(375, 475, "Follow the curve", 24, paper, 700)}
  ${text(710, 231, "SELECTED STUDY", 15, muted)}${text(710, 282, "Traverse", 36, ink, 700)}${text(710, 320, "Point → path → rest", 20, muted)}
  ${rule(710, 353, 258)}${text(710, 384, "Distance", 18, muted)}${text(886, 384, "320 px", 20, ink, 700)}${text(710, 429, "Direction", 18, muted)}${text(879, 429, "Forward", 20, ink, 700)}
  ${rect(710, 472, 260, 74, "#e4ded1", 6)}${text(730, 501, "●  ANCHOR 03", 15, ink, 700)}${text(730, 528, "Ready to explore", 20, ink)}`,
  ),
);

writeFileSync(
  resolve(target, "signalMonitor.svg"),
  shell(
    "Signal monitor",
    "04",
    `${text(30, 137, "Signal monitor", 42, paper, 700)}${text(30, 173, "Illustrative readings / Static response curve", 21, "#bdc1c3")}${text(824, 138, "●  SETTLED", 18, highlight, 700)}
  ${rect(30, 209, 940, 217, "#2d3032", 8)}${[0, 1, 2, 3].map((i) => rule(55, 235 + i * 50, 890, "#484b4c")).join("")}
  ${path("M60 385 C85 385 90 233 140 241 S196 383 247 330 S294 249 351 280 S408 334 464 309 S521 288 577 300 S635 314 690 308 S770 307 830 308 H940", highlight, 5)}
  ${text(57, 408, "0.00 s", 15, "#bdc1c3")}${text(879, 408, "1.50 s", 15, "#bdc1c3")}
  ${[
    ["PEAK", "1.18", "+18%"],
    ["REST", "0.86 s", "Within threshold"],
    ["TARGET", "1.00", "Position"],
  ]
    .map((values, i) => {
      const x = 30 + i * 319;
      return `${rect(x, 449, 302, 98, "#343638", 7)}${text(x + 18, 476, values[0]!, 14, highlight)}${text(x + 18, 519, values[1]!, 34, paper, 700)}${text(x + 181, 520, values[2]!, 15, "#bdc1c3")}`;
    })
    .join("")}`,
    true,
  ),
);

const settingsRows = [
  ["Snap points", "Three anchors"],
  ["Release", "Follow velocity"],
  ["Edge behavior", "Elastic"],
  ["Motion preference", "Follow system"],
]
  .map((values, i) => {
    const y = 225 + i * 78;
    return `${rule(30, y - 15, 580)}${text(30, y + 14, values[0]!, 24, ink, 700)}${text(30, y + 42, values[1]!, 17, muted)}${rect(540, y, 60, 31, i === 3 ? "#a6acaf" : ink, 16)}${circle(583, y + 15, 11, paper)}`;
  })
  .join("");
writeFileSync(
  resolve(target, "surfaceSettings.svg"),
  shell(
    "Surface settings",
    "05",
    `${text(30, 137, "Surface settings", 42, ink, 700)}${text(30, 173, "Fold / A place for every state", 21, muted)}${settingsRows}
  ${rect(650, 210, 320, 337, "#e4ded1", 8)}${text(674, 248, "SURFACE PREVIEW", 15, muted)}
  ${rect(697, 275, 225, 225, paper, 12)}${rect(697, 366, 225, 134, ink, 12)}${rect(771, 378, 76, 5, highlight, 3)}${text(718, 427, "Comfortable", 24, paper, 700)}${text(718, 463, "Anchor 02 / 03", 17, highlight)}`,
  ),
);
process.stdout.write(`Generated five original screens in ${target}\n`);
