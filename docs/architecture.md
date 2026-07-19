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
models and events, and the bottom sheet's native radio snap alternative. Consumers still own media,
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
- `bottom-sheet` owns sheet components, context, semantic snap policy, state contracts, and the
  sheet composable.
- `dialog` owns the native modal component, close contract, and the deliberately public headless
  focus-policy facade.
- `motion` owns the Vue adapter over `SnapController`, the Motion driver, semantic navigation
  reasons, and reduced-motion integration.
- `localization` owns the shared message contract and English defaults.
- `internal/accessibility`, `internal/input`, and `internal/layout` own non-public focus traversal,
  pointer capture/intent, and remeasurement mechanics.

Components may depend on their feature, `motion`, `localization`, and precise internal capabilities.
The bottom sheet may use the dialog close contract. Internal capabilities never depend on finished
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

The npm registry's latest TypeScript at repository creation was 7.0.2, but stable `vue-tsc` 3.3.7
could not load TypeScript 7's removed `./lib/tsc` package subpath. TypeScript 6.0.3 is therefore the
newest mutually compatible stable combination. Current type-aware Oxlint requires TypeScript 7,
so ordinary Oxlint is enabled and type checking remains an explicit vue-tsc/tsc gate. Type-aware
linting should be reconsidered when a stable vue-tsc release supports TypeScript 7.

JavaScript remains bundled ESM. TypeScript and Vue declarations are first emitted to a temporary
graph and then rolled up by API Extractor for every export-map entrypoint. This permits extensionless
source imports without publishing extensionless Node-resolution edges. A temporary Vue declaration
normalization step remains before rollup for minimum-Vue SFC generic compatibility; only the
self-contained rollups ship.
