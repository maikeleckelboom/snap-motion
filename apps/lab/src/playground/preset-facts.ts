import { settingsFromPreset } from "../fixtures/lab-settings";
import type { LabPhysicsSettings, LabPresetName } from "../fixtures/lab-types";

/**
 * The four base presets with copy that states only comparisons the values support. There is no
 * perceptual claim here: "Stiffest" and "Highest mass" are checked against the engine presets in
 * `preset-facts.test.ts`, so the text cannot drift from the numbers it describes.
 */
export const presetOptions: readonly {
  label: string;
  note: string;
  value: LabPresetName;
}[] = [
  { value: "tight", label: "Tight", note: "Stiffest spring." },
  { value: "balanced", label: "Balanced", note: "Between Tight and Loose." },
  { value: "heavy", label: "Heavy", note: "Highest mass; a release travels at most one step." },
  { value: "loose", label: "Loose", note: "Softest spring and the widest elastic edge." },
];

export function presetLabel(name: LabPresetName): string {
  return presetOptions.find(({ value }) => value === name)?.label ?? name;
}

export function presetNote(name: LabPresetName): string {
  return presetOptions.find(({ value }) => value === name)?.note ?? "";
}

/** The three spring values that define a preset's feel, read from the engine preset itself. */
export function springSummary(settings: LabPhysicsSettings): string {
  return `Stiffness ${settings.stiffness} · Damping ${settings.damping} · Mass ${settings.mass}`;
}

export function presetSpringSummary(name: LabPresetName): string {
  return springSummary(settingsFromPreset(name));
}
