import { inject, type InjectionKey } from "vue";

import type { StudyId } from "./studies";
import type { StudyCategoryId } from "./studies";
import type { StudioModel } from "./studio-model";

export type StudioSelectionOrigin = "grid" | "coverflow" | "deck" | "inspector" | "tray";

/** What the Studio's surfaces read and ask for. The workspace owns the model and these actions. */
export interface StudioContext {
  readonly model: StudioModel<StudyId, StudyCategoryId>;
  /** Announces a committed change on the workspace's one polite live region. */
  announce(message: string): void;
}

export const studioKey: InjectionKey<StudioContext> = Symbol("motion-studio");

export function useStudio(): StudioContext {
  const studio = inject(studioKey);
  if (!studio) throw new Error("Motion Studio surfaces must render inside the Studio workspace.");
  return studio;
}
