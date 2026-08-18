# Tuning in the lab

Run `pnpm dev` and choose one interaction surface. The default Showcase keeps the interaction as the
primary decision. Select **Workbench** or **Inspect motion** to use the same surface with compact live
telemetry; expand **Advanced physics** for numeric tuning and **Full diagnostics** for surface-specific
state. **Fixtures** contains deterministic package-default, assistive-technology, adaptive-host,
variable-geometry, and render-window evidence without duplicating product demos.

Inside Advanced physics, the preset selector loads a coherent baseline. Editable controls then
create a temporary tuning variant. **Reset to preset** discards those edits. Controls appear only
when the active registry entry declares that the surface consumes them.

- **Stiffness** increases acceleration toward the target.
- **Damping** removes oscillation and slows the final approach when raised.
- **Mass** makes the same forces feel heavier and more deliberate.
- **Rest speed** is the velocity below which completion may be considered.
- **Rest distance** is the remaining target distance allowed at completion.
- **Projection duration** controls how far release velocity looks ahead before target selection.
- **Fling threshold** defines when direction becomes decisive.
- **Maximum anchor skip** caps rendered pointer travel and logical travel for every release,
  including a slow long drag and a projected fling.
- **Elastic resistance** changes how quickly out-of-bounds movement is resisted.
- **Maximum elastic distance** caps temporary visual overdrag.
- **Programmatic impulse** gives button and keyboard actions directional momentum inside the same
  spring system.

Use the stage width presets and slider to test remeasurement. Exercise regular,
extremely wide, extremely tall, transformed, delayed, unequal-width, and one-item fixtures. Toggle
reduced motion explicitly rather than relying only on the host preference.

Compact telemetry exposes phase, active or visual item, rendered position, and velocity. Full
diagnostics retain intended target, semantic ID, bounds, viewport, extent, reduced-motion state,
pointer ownership, animation status, and surface-specific values. Measured anchors have a separate
disclosure. All remain lab-only observability and are not part of reusable primitives.
