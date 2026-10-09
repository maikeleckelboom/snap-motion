import { computed, ref, shallowRef } from "vue";

import { isLabPresetName, settingsFromPreset } from "../fixtures/lab-settings";
import type { LabPhysicsSettings, LabPresetName } from "../fixtures/lab-types";
import { modifiedPhysicsKeys, unsupportedPhysicsSetting } from "../fixtures/physics-parameters";

/**
 * The one owner of a page's shared physics configuration: the selected base preset and the
 * settings object every mounted surface consumes. The Lab and the public Playground each call this
 * once at their root; sections and tuning interfaces only read it or ask it to change.
 *
 * Modification state is derived, never stored: every shared value that differs from the base
 * preset counts, including values the surface under the pointer fixes or ignores, because another
 * surface still uses them.
 */
export function useSharedPhysics(initialPreset: LabPresetName = "balanced") {
  const preset = ref<LabPresetName>(initialPreset);
  const settings = shallowRef<LabPhysicsSettings>(settingsFromPreset(initialPreset));
  const modifiedKeys = computed(() =>
    modifiedPhysicsKeys(settings.value, settingsFromPreset(preset.value)),
  );

  function updateSettings(next: LabPhysicsSettings) {
    // The fields commit only supported values. Every other writer is held to the same contract: a
    // controller throws on a value it cannot use, and the surface it drives stops responding.
    if (unsupportedPhysicsSetting(next) !== undefined) return;
    settings.value = next;
  }

  function applyPreset(name: LabPresetName) {
    if (!isLabPresetName(name)) return;
    preset.value = name;
    settings.value = settingsFromPreset(name);
  }

  function resetToPreset() {
    if (modifiedKeys.value.length > 0) settings.value = settingsFromPreset(preset.value);
  }

  return { applyPreset, modifiedKeys, preset, resetToPreset, settings, updateSettings };
}
