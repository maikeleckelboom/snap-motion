import { STACKED_DECK_ANCHOR_SKIP } from "@snap-motion/core";
import type { Component } from "vue";

import AdaptiveSupportingPaneDemo from "@/demos/AdaptiveSupportingPaneDemo.vue";
import CoverflowDemo from "@/demos/CoverflowDemo.vue";
import DefaultSurfacesDemo from "@/demos/DefaultSurfacesDemo.vue";
import MediaGalleryAtCertificationDemo from "@/demos/MediaGalleryAtCertificationDemo.vue";
import MediaLightboxDemo from "@/demos/MediaLightboxDemo.vue";
import OverlayLifecycleFixture from "@/demos/OverlayLifecycleFixture.vue";
import PagedGridDemo from "@/demos/PagedGridDemo.vue";
import RealmOverlayFixture from "@/demos/realm-overlay-fixture.vue";
import RenderWindowFixture from "@/demos/RenderWindowFixture.vue";
import SheetDemo from "@/demos/SheetDemo.vue";
import StackedDeckOverflowFixture from "@/demos/stacked-deck-overflow-fixture.vue";
import StackedDeckDemo from "@/demos/StackedDeckDemo.vue";
import VariableRailFixture from "@/demos/VariableRailFixture.vue";

import type { LabPhysicsSettings } from "./lab-types";

export type DemoAudience = "showcase" | "fixture";
export type DemoGroup = "Spatial" | "Media" | "Surfaces" | "Certification" | "Geometry";
export type LabView = "showcase" | "workbench" | "fixtures";

export interface DemoCapabilities {
  inspectionPresentation?: boolean;
  motionPreference: boolean;
  physics: boolean;
  stageWidth: boolean;
}

export interface LabLocation {
  demo: DemoId;
  view: LabView;
}

export interface LabDemo {
  audience: DemoAudience;
  capabilities: DemoCapabilities;
  component: Component;
  description: string;
  group: DemoGroup;
  id: string;
  label: string;
  notApplicablePhysics?: Partial<Record<keyof LabPhysicsSettings, string>>;
}

export const demos = [
  {
    id: "coverflow",
    label: "Coverflow",
    description:
      "A spatial screen rail with direct drag, elastic boundaries, and spring settlement.",
    group: "Spatial",
    audience: "showcase",
    component: CoverflowDemo,
    capabilities: {
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "stacked-deck",
    label: "Stacked Deck",
    description: "A compact physical pile that exchanges exactly one adjacent screen.",
    group: "Spatial",
    audience: "showcase",
    component: StackedDeckDemo,
    notApplicablePhysics: {
      maxAnchorSkip: `Fixed at ${STACKED_DECK_ANCHOR_SKIP} by the stacked deck: one interaction exchanges one adjacent screen. Other surfaces keep using the stored value.`,
    },
    capabilities: {
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "grid",
    label: "Paged Grid",
    description: "A product-level paged collection with explicit internal rows, columns, and gaps.",
    group: "Spatial",
    audience: "showcase",
    component: PagedGridDemo,
    capabilities: {
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "media",
    label: "Gallery / Lightbox",
    description: "A modal media surface for containment, semantic resize, and interruption.",
    group: "Media",
    audience: "showcase",
    component: MediaLightboxDemo,
    capabilities: {
      inspectionPresentation: true,
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "sheet",
    label: "Sheet",
    description:
      "A multi-edge modal surface with semantic visible extents and native body scrolling.",
    group: "Surfaces",
    audience: "showcase",
    component: SheetDemo,
    capabilities: {
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "defaults",
    label: "Default Surfaces",
    description: "The zero-configuration Coverflow and Stacked Deck contract consumers receive.",
    group: "Certification",
    audience: "fixture",
    component: DefaultSurfacesDemo,
    capabilities: {
      motionPreference: true,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "gallery-at",
    label: "Gallery AT Harness",
    description: "Deterministic manual assistive-technology scenarios and a non-live event trace.",
    group: "Certification",
    audience: "fixture",
    component: MediaGalleryAtCertificationDemo,
    capabilities: {
      motionPreference: true,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "stacked-deck-overflow",
    label: "Stacked Deck Overflow",
    description:
      "Three-item narrow-page regression fixture with minimal and responsive media-like content.",
    group: "Certification",
    audience: "fixture",
    component: StackedDeckOverflowFixture,
    capabilities: {
      motionPreference: true,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "adaptive-sheet",
    label: "Adaptive Sheet Host",
    description: "Host-owned inline-to-sheet composition, state preservation, and focus transfer.",
    group: "Certification",
    audience: "fixture",
    component: AdaptiveSupportingPaneDemo,
    capabilities: {
      motionPreference: true,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "overlay-lifecycle",
    label: "Overlay Lifecycle",
    description: "Native dialog close-generation, focus-return, and scroll-lock race proof.",
    group: "Certification",
    audience: "fixture",
    component: OverlayLifecycleFixture,
    capabilities: {
      motionPreference: false,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "realm-overlay",
    label: "Realm Overlay",
    description: "Iframe-realm focus return and adopted-document image handling proof.",
    group: "Certification",
    audience: "fixture",
    component: RealmOverlayFixture,
    capabilities: {
      motionPreference: false,
      physics: false,
      stageWidth: false,
    },
  },
  {
    id: "variable-rail",
    label: "Variable Rail",
    description: "Unequal-width centered geometry measured from rendered item boxes.",
    group: "Geometry",
    audience: "fixture",
    component: VariableRailFixture,
    capabilities: {
      motionPreference: true,
      physics: true,
      stageWidth: true,
    },
  },
  {
    id: "render-window",
    label: "Render Window",
    description: "One hundred semantic items with bounded mounting and preload candidates.",
    group: "Geometry",
    audience: "fixture",
    component: RenderWindowFixture,
    capabilities: {
      motionPreference: false,
      physics: false,
      stageWidth: false,
    },
  },
] as const satisfies readonly LabDemo[];

export type DemoId = (typeof demos)[number]["id"];

export function isDemoId(value: unknown): value is DemoId {
  return typeof value === "string" && demos.some((demo) => demo.id === value);
}

export function isLabView(value: unknown): value is LabView {
  return value === "showcase" || value === "workbench" || value === "fixtures";
}

/**
 * Resolve URL state with the demo's declared audience as the authority. The returned pair is the
 * only state the shell is allowed to render and is also the canonical pair written back to the URL.
 */
export function resolveLabLocation(demoValue: unknown, viewValue: unknown): LabLocation {
  const explicitDemo = isDemoId(demoValue)
    ? demos.find((demo) => demo.id === demoValue)
    : undefined;
  const explicitView = isLabView(viewValue) ? viewValue : undefined;

  if (explicitDemo?.audience === "fixture") {
    return { demo: explicitDemo.id, view: "fixtures" };
  }

  if (explicitDemo) {
    return {
      demo: explicitDemo.id,
      view: explicitView === "workbench" ? "workbench" : "showcase",
    };
  }

  if (explicitView === "fixtures") {
    return { demo: "defaults", view: "fixtures" };
  }

  return {
    demo: "coverflow",
    view: explicitView === "workbench" ? "workbench" : "showcase",
  };
}
