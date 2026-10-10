# Tuning in the lab

This page covers the engineering Lab. The public Playground at `/playground/` exposes the same
shared configuration to visitors; see [Tuning in the Playground](#tuning-in-the-playground) below.

Run `pnpm dev` and choose one interaction surface. The default Showcase keeps the interaction as the
primary decision. Select **Workbench** or **Inspect motion** to use the same surface with compact live
telemetry; expand **Advanced physics** for grouped tuning and **Full diagnostics** for surface-specific
state. **Fixtures** contains deterministic package-default, assistive-technology, adaptive-host,
variable-geometry, and render-window evidence without duplicating product demos.

Inside Advanced physics, the preset selector loads the exact Tight, Balanced, Heavy or Loose engine
baseline. Balanced is the lab's initial choice; Tight remains the package default. The status shows
**Preset** when every shared value matches that baseline and **Modified (n)** otherwise. It counts
all shared settings, including ones the current demo fixes or ignores. **Reset to preset** restores
every value exactly. Choosing another preset replaces earlier edits and unfinished drafts.

The five semantic groups are native disclosures with named fieldsets. Spring and Release start open;
the other groups stay compact until needed. At tablet widths the groups use two columns. All settings
stay in Workbench for this milestone; see [reviewed design decisions](showcase-design-decisions.md).

| Group              | Parameter              | Meaning                                                                                        |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| Spring             | **Stiffness**          | Strength of the force pulling toward the target.                                               |
| Spring             | **Damping**            | Resistance to motion during settling; raising it can reduce oscillation and slow the approach. |
| Spring             | **Mass**               | Inertia under the same spring forces.                                                          |
| Release            | **Projection**         | Seconds of velocity look-ahead used for a decisive fling, before selecting its anchor.         |
| Release            | **Fling threshold**    | Release speed at which direction and projection become decisive.                               |
| Release            | **Maximum skip**       | Integer cap on rendered drag travel and release anchor travel, including slow long drags.      |
| Boundaries         | **Elastic resistance** | Higher values resist out-of-bounds overdrag more strongly.                                     |
| Boundaries         | **Elastic limit**      | Maximum temporary visual overdrag beyond a legal edge.                                         |
| Buttons & keys     | **Control impulse**    | Directional starting velocity for button and keyboard moves in the same spring system.         |
| Settling precision | **Rest speed**         | Speed threshold for completion.                                                                |
| Settling precision | **Rest distance**      | Remaining target distance threshold; both rest thresholds must be met.                         |

Eight fields pair an accessible, distinctly named slider (for example, **Stiffness slider**) with an
exact numeric input (**Stiffness**). Sliders support pointer adjustment, Arrow keys by the registry
increment, Page Up/Down by ten increments, and Home/End at the limits. Maximum skip and both rest
thresholds are numeric-only. Descriptions and validation messages are associated with their controls.
Numeric decimal inputs use `step="any"`: supported values such as mass `0.851` remain valid and the
slider reflects their exact value. Pointer slider edits snap to the registry increment; keyboard
increments start from the current value. Neither path changes the supported numeric ranges.

Supported numeric edits apply live. Empty, malformed, non-finite, out-of-range or in-range fractional
skip drafts never reach a controller. Enter or blur keeps a supported value, bounds a finite
out-of-range value, and otherwise restores the current committed value. Escape discards an unfinished
draft without bounding it or undoing valid edits already applied. Moving a slider immediately replaces
that field's draft, including when its new value equals the current setting; later Enter/blur cannot
restore the stale draft. External preset replacements synchronize all controls, even for unchanged
values. A live edit preserves other fields' unfinished drafts.

Settings remain shared across demos and owned by `App.vue`. A fixed or unused field is disabled and
explained, with no ineffective slider. Stacked Deck displays effective **Maximum skip = 1**, while its
note shows the shared stored value used by other surfaces. Navigating back to Coverflow restores that
editable stored value; the global Modified count remains accurate on both surfaces.

Use the stage width presets and slider to test remeasurement. Exercise regular,
extremely wide, extremely tall, transformed, delayed, unequal-width, and one-item fixtures. Toggle
reduced motion explicitly rather than relying only on the host preference.

Compact telemetry exposes phase, active or visual item, rendered position, and velocity. Full
diagnostics retain intended target, semantic ID, bounds, viewport, extent, reduced-motion state,
pointer ownership, animation status, and surface-specific values. Measured anchors have a separate
disclosure. All remain lab-only observability and are not part of reusable primitives.

## Tuning in the Playground

`pnpm dev` serves the Lab at `/` and the public page at `/playground/`. `pnpm build` emits the
Playground at `index.html` and `playground/index.html`, with the Lab at `lab/index.html`.
Both work under any base (the preview gate uses `/snap-motion/`). The Playground has no Lab
navigation; access the Lab and its query deep links directly.

Every section has a **Motion tuning** bar under its stage: the Tight, Balanced, Heavy and Loose
presets with the selected base pressed, and **Customize**. **Modified (n)** and **Reset** appear when
settings differ from the selected preset. Preset descriptions and numeric summaries are in the editor.
The bars are views of one configuration owned by `useSharedPhysics`, the same owner the Lab uses, so a
change made in any section moves all five surfaces and every bar agrees. Modified counts every shared
value against the base preset, including values a surface fixes or ignores. Choosing a preset replaces
manual edits and unfinished drafts; Balanced is the starting choice and Tight remains the package
default.

**Customize** opens the five parameter groups (Spring, Release, Boundaries, Buttons & keys, Settling
precision) below that section's bar, using the same fields, validation and ranges as the Lab's
Workbench. One editor is open at a time, so ids, drafts and focus have a single owner; opening
another section's editor closes the first and keeps the control you pressed where it was. Stacked Deck
shows **Maximum skip = 1** as fixed and names the shared stored value other surfaces still use.

The **spring response** plot samples the engine's own spring stepper and rest rule for one card-width
move from rest. It shows the spring alone: release velocity, elastic edges and reduced motion are not
part of it, and it is dimmed while reduced motion is on. Reduced motion (the system preference, or
the editor's **Motion preference** override) skips the spring settle, so Spring and Settling
precision edits are not visible; drag-time and release behavior still follow the settings.
