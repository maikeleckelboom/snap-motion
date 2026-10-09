import { inject, type InjectionKey, type Ref } from "vue";

import type { LabPhysicsSettings, LabPresetName, ReducedMotionMode } from "../fixtures/lab-types";
import type { PhysicsKey } from "../fixtures/physics-parameters";
import type { PlaygroundSectionId } from "./sections";

/**
 * What every section's Motion Tuning reads and asks for. The page root owns the single shared
 * configuration; this context hands out read-only refs and the only functions allowed to change it,
 * so no section can hold a second copy of the settings or a competing preset indicator.
 */
export interface PlaygroundTuning {
  readonly applyPreset: (name: LabPresetName) => void;
  /** True when surfaces settle without a spring: the system asks for it or the visitor chose it. */
  readonly effectiveReducedMotion: Readonly<Ref<boolean>>;
  /** The one section whose detailed editor is open, so there is only ever one editor instance. */
  readonly expandedSection: Readonly<Ref<PlaygroundSectionId | undefined>>;
  readonly modifiedKeys: Readonly<Ref<readonly PhysicsKey[]>>;
  readonly motionMode: Ref<ReducedMotionMode>;
  readonly preset: Readonly<Ref<LabPresetName>>;
  readonly resetToPreset: () => void;
  readonly settings: Readonly<Ref<LabPhysicsSettings>>;
  /** Opens or closes a section's editor, keeping `anchor` where it is on screen. */
  readonly toggleEditor: (section: PlaygroundSectionId, anchor?: HTMLElement) => Promise<void>;
  readonly updateSettings: (next: LabPhysicsSettings) => void;
}

export const playgroundTuningKey: InjectionKey<PlaygroundTuning> = Symbol("playground-tuning");

export function usePlaygroundTuning(): PlaygroundTuning {
  const tuning = inject(playgroundTuningKey);
  if (!tuning) throw new Error("Motion Tuning must render inside the Playground page.");
  return tuning;
}
