# 0001: Use Motion behind a narrow driver

Status: accepted

## Decision

Use the imperative `animate` API from `motion` to implement a narrow scalar animation-driver
contract defined in the framework-neutral core.

## Rationale

Motion supports physical springs with explicit stiffness, damping, mass, rest thresholds, and
initial velocity. The driver can be stopped immediately and can report every scalar update. The
core remains deterministic under a fake driver and does not depend on Motion, Vue, or the DOM.

Popmotion is retired. The bottom-sheet donor selected a velocity-aware target but then used a
fixed-duration keyframe ease, losing release momentum during settling. Declarative Motion drag
components and `motion-v` are also out of scope because pointer ownership and target selection belong
to this system.
