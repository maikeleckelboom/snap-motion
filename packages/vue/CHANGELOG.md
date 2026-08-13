# @snap-motion/vue

## 0.1.0-beta.8

### Minor Changes

- Keep core and Vue provenance aligned for the private beta.8 candidate. Vue Gallery retries now
  capture the browser-selected responsive `currentSrc`, issue a distinct request for that exact
  resource, and invalidate retry work across authority, collection, and open-cycle changes. Gallery
  source distinctness now includes `sizes` only when a shared `srcset` can select different resources,
  while intrinsic geometry remains outside network identity.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.8

## 0.1.0-beta.7

### Minor Changes

- Align core and Vue provenance for the beta.7 private candidate. Core package bytes remain coherent
  with the Vue candidate. Vue replaces scalar Gallery URLs with responsive preview and full source
  objects, defaults full-image promotion to the mechanically current item, makes DOM guards safe
  across iframe and adopted-document realms, and certifies rapid overlay lifecycle cleanup. The lab,
  SSR, packed-consumer, browser-network, documentation, and API fixtures now exercise that contract.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.7

## 0.1.0-beta.6

### Minor Changes

- Align core and Vue provenance for the beta.6 private candidate. Core has no runtime or public API
  change in this candidate. Vue renders mechanically settled Media Gallery descriptions, adds one
  optional no-prop `actions` slot inside the native modal, and keeps the expanded header bounded at
  narrow allocations. Its bounded native-dialog focus verifier also preserves an immediate keyboard,
  pointer, or application focus handoff across late browser cleanup without reclaiming focus after
  that handoff stabilizes or disconnects. A configured opener takes priority over focus assigned by
  native cleanup, while an immediate application handoff from that opener is preserved even when it
  precedes verifier registration. Stacked Deck now applies layout containment at its public root
  while preserving visible overflow, and gains exact frame-sampled narrow-consumer regression
  coverage for both directions.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.6

## 0.1.0-beta.5

### Minor Changes

- Align core and Vue provenance for the beta.5 private candidate. Core has no runtime or public API
  change in this candidate. Vue preserves an accepted in-flight uncontrolled destination across a new
  unavailable controlled epoch and makes verified native-dialog focus return respect later legitimate
  keyboard, pointer, application, and overlay focus ownership.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- Align core and Vue provenance for the beta.4 private candidate. Vue closes the remaining controlled
  authority-epoch, native-dialog focus-repair, and imperative Gallery navigation gaps, while docs and
  consumer proof clarify guarded ownership, nested-overlay support, package exports, and TypeScript
  handoff.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.4

## 0.1.0-beta.3

### Minor Changes

- Correct the final private-beta authority and overlay lifecycle edge cases. Controlled acknowledgements
  now update rollback authority before motion can settle, controlled ownership handoff cannot accept a
  pending request, stale native dialog close events cannot finalize newer lifecycles, and Media Gallery
  normalization widens repaired base fields without losing literal IDs or consumer metadata.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.3

## 0.1.0-beta.2

### Minor Changes

- Correct the pre-publication controlled-state contract. Component-originated selection and close
  events are now explicit requests, controlled semantic state remains prop-authoritative through
  ignored, delayed, or replaced requests, and rejected mechanics produce no false settlement or live
  announcement. Rename low-level nearest-anchor telemetry, align `navigateTo` vocabulary, make Media
  Gallery preserve the exact inferred item ID union through its full public surface, and strengthen
  packed TypeScript 6/7 consumer proof with library checking enabled.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- Freeze the first public state contract around application-authoritative `activeId`, immediate
  semantic change events, later mechanical settlement, stable-ID Media Gallery routing, exact silent
  synchronization, shared navigation and close provenance, deliberate package entrypoints, and clean
  declaration reports. Upgrade repository TypeScript work to TypeScript 7 while using Vue Language
  Tools' supported TypeScript 6 bridge for SFC compilation and certify both consumer compiler lines.

### Patch Changes

- Updated dependencies
  - @snap-motion/core@0.1.0-beta.1
