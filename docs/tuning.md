# Tuning in the lab

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
