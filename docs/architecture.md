# Architecture

## Governing rule

Layout decides where valid anchors are. Interaction decides which anchor is intended. Motion
decides how position reaches that anchor.

The system deliberately keeps these responsibilities in three layers.

## Framework-neutral core

`@snap-motion/core` owns scalar bounds, nonlinear elasticity, velocity sampling, projection,
semantic anchors, release targeting, carousel geometry, motion presets, and the interruptible
controller. It imports neither Vue nor the DOM and has no runtime dependency.

An anchor combines a stable ID, a physical scalar position, and logical order. Physical positions
may repeat. Semantic identity is therefore never inferred from a deduplicated number array.

Presentation projection is also framework-neutral. The per-card Coverflow rail resolver consumes a
scalar position. The whole-frame deck projection consumes that position as a continuous physical
index, advances visual ownership at each crossed anchor, and projects only the active adjacent
segment. It mutates caller-owned traversal and frame storage and owns only physical shell geometry,
paint layers, and the ordered source index for each non-dominant pose; it does not own motion,
targets, final selection, application material, or DOM state.

Above those primitives, core owns two **surface models**. `StackedDeckModel` and `CoverflowModel`
compose the generic controller's snapshots into a surface's semantics: durable versus visual
selection, interaction authority, the one-adjacent-card interaction envelope, relative versus
absolute command policy, direct synchronization, and announcement timing. They are the reason a deck
is a deck. They issue no controller commands, touch no DOM, and never narrow the generic controller;
`SnapController` and `resolveStackedDeckTraversal` both keep their full multi-anchor capability.

Shared deterministic policy lives beside them: settled selection and visual hysteresis, pagination
projection, bounded autonomous spring integration and release-velocity limiting, coverflow kinetics
and responsive tuning, direct-manipulation gesture arbitration, and the semantic key mapping. The
lab owns none of it.

The controller has three public phases: `idle`, `dragging`, and `settling`. Every input interrupts
the current playback before acting. There is no queue and no animation-event ownership handoff.
The controller tracks rendered position and velocity from driver updates, guards callbacks with a
playback generation, and can retarget the same semantic ID after geometry changes.

## Vue and Motion adapter

`@snap-motion/vue` translates controller snapshots into Vue refs and computed state. It owns
Pointer Event binding, pointer capture and cancellation, touch intent arbitration, wheel
normalization, ResizeObserver and visual-viewport observation, reduced-motion changes, DOM layout
measurement, and lifecycle cleanup.

The package also owns a style-light production component layer above those composables. The layer
encodes carousel and slide roles, stable accessibility relationships, inactive-slide inertness,
native dialog lifecycle, explicit focus entry and return, settled status announcements, controlled
models and events, and the sheet's native radio snap alternative. Consumers still own media,
captions, application layout, routing, and visual treatment.

The generic reduced-motion media query, resize observation, and event-listener cleanup use
`@vueuse/core`. Snap Motion keeps its domain-specific controller, pointer-intent, focus-policy, and
semantic completion behavior because those contracts are not generic browser wrappers.

The Motion driver implements the core animation-driver contract through imperative `animate` from
`motion`. It receives an already-selected `from`, `to`, initial velocity in pixels per second, and
physical spring parameters. It reports every scalar update and can be stopped immediately.

Motion does not measure layout, choose targets, own semantic active IDs, clamp carousel bounds, or
replace the Pointer Event policy.

## Vue feature ownership

`packages/vue/src` is organized by supported capability rather than implementation form:

- `carousel` owns carousel components, context, contracts, geometry, keyboard and wheel policy,
  render windows, and carousel composables.
- `coverflow` and `stacked-deck` own one spatial surface each: its component, its composable, and
  its presentation contracts. Both compose the shared horizontal carousel adapter and the core
  surface model rather than reimplementing either.
- `sheet` owns sheet components, context, semantic snap policy, side descriptors, state contracts, and the
  sheet composable.
- `dialog` owns the native modal component, close contract, and the deliberately public headless
  focus-policy facade.
- `motion` owns the Vue adapter over `SnapController`, the Motion driver, semantic navigation
  reasons, and reduced-motion integration.
- `localization` owns the shared message contract and English defaults.
- `internal/accessibility`, `internal/input`, and `internal/layout` own non-public focus traversal,
  pointer capture/intent, and remeasurement mechanics.

Components may depend on their feature, `motion`, `localization`, and precise internal capabilities.
The sheet may use the dialog close contract; a spatial surface may use `useCarouselMotion`. Internal capabilities never depend on finished
features; feature internals do not cross-import one another. Application and fixture code consumes
package entrypoints, never source paths. `pnpm architecture:check` enforces these directions, rejects
cycles and wildcard entrypoint exports, and enforces extensionless TypeScript-relative imports.

Feature `index.ts` files are public boundaries. Internal modules use concrete imports rather than
feature barrels so dependency direction stays visible.

## One source of rendered truth

Each interaction surface has exactly one authoritative scalar position. The track or sheet transform
is derived from it. CSS transitions, smooth scrolling, native scroll snap, and parallel animation
systems are not allowed to animate the same value. Sheet scrim opacity is also derived from the
sheet scalar rather than animated independently.

Every sheet side is adapted onto the same canonical scalar: the scalar increases toward closed.
Bottom and right use a positive physical transform; top and left mirror it. Pointer deltas and
release velocity are normalized at the adapter boundary, so release policy and scrim progress have
one direction-independent implementation. Hidden is an internal final anchor and is always the
largest canonical position.

For layered presentations, geometry and DOM paint order are intentionally separate outputs of the
same frame resolver. The deck assigns layers from explicit exchange roles and never flips them at a
progress threshold. The settled selection remains the sole authority for caption, pagination,
focus, inspection, and announcement timing until controller settlement.

## Remeasurement

Remeasurement is a controller transition, not a passive correction:

1. Remember the active or targeted semantic ID.
2. Measure viewport and item or page layout boxes.
3. Rebuild legal bounds and clamped semantic anchors.
4. Resolve the same ID in the new geometry.
5. Place exactly when idle, retarget from rendered position and velocity when settling, or preserve
   pointer-relative displacement while dragging.

No stale offset from the old geometry becomes authoritative.

During SSR, carousels begin with deterministic zero-width semantic anchors. The controlled active
ID therefore exists before geometry does. The first client measurement preserves that ID and places
it exactly without an entrance spring.

## Toolchain compatibility

The maintainer workspace uses TypeScript 7.0.2 for repository `.ts` code and the core package.
TypeScript 7 intentionally removed the programmatic compiler API, so Vue Language Tools 3.3.9 runs
Vue SFC declaration/template work through its supported `@typescript/typescript6` bridge. That
bridge currently resolves TypeScript 6.0.2. Directly pairing `vue-tsc` with TypeScript 7 fails at
the removed `typescript/lib/tsc` subpath; keeping only Vue-owning workspaces on the supported bridge
preserves a truthful TypeScript 7 migration without a local loader hack.

Type-aware Oxlint can use the root TypeScript 7 toolchain. Type checking remains an explicit
`tsc`/`vue-tsc` gate, and packed fixtures certify both current TypeScript declarations and real SFC
template inference.

JavaScript remains bundled ESM. TypeScript and Vue declarations are first emitted to a temporary
graph and then rolled up by API Extractor for every export-map entrypoint. This permits extensionless
source imports without publishing extensionless Node-resolution edges. A temporary Vue declaration
normalization step remains before rollup for minimum-Vue SFC generic compatibility; only the
self-contained rollups ship.
