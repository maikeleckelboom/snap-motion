# Tuning in the lab

Run `pnpm dev`, choose one interaction surface, and manipulate it directly before changing values.
The primary decision in each lab state is the physical response of the selected surface; fixtures,
controls, and diagnostics exist only to support that decision.

The preset selector loads a coherent baseline. Editable controls then create a temporary tuning
variant. **Reset to preset** discards those edits.

- **Stiffness** increases acceleration toward the target.
- **Damping** removes oscillation and slows the final approach when raised.
- **Mass** makes the same forces feel heavier and more deliberate.
- **Rest speed** is the velocity below which completion may be considered.
- **Rest distance** is the remaining target distance allowed at completion.
- **Projection duration** controls how far release velocity looks ahead before target selection.
- **Fling threshold** defines when direction becomes decisive.
- **Maximum anchor skip** caps logical travel for every pointer release, including a slow long drag
  and a projected fling.
- **Elastic resistance** changes how quickly out-of-bounds movement is resisted.
- **Maximum elastic distance** caps temporary visual overdrag.
- **Programmatic impulse** gives button and keyboard actions directional momentum inside the same
  spring system.

Use the stage width presets and free resize handle to test remeasurement. Exercise regular,
extremely wide, extremely tall, transformed, delayed, unequal-width, and one-item fixtures. Toggle
reduced motion explicitly rather than relying only on the host preference.

Diagnostics expose phase, rendered position and velocity, intended target, active semantic ID,
bounds, anchors, viewport, extent, reduced-motion state, pointer ownership, and animation status.
They live in the lab and are not part of reusable primitives.
