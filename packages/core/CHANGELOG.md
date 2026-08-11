# @snap-motion/core

## 0.1.0-beta.4

### Minor Changes

- Align core and Vue provenance for the beta.4 private candidate. Vue closes the remaining controlled
  authority-epoch, native-dialog focus-repair, and imperative Gallery navigation gaps, while docs and
  consumer proof clarify guarded ownership, nested-overlay support, package exports, and TypeScript
  handoff.

## 0.1.0-beta.3

### Minor Changes

- Correct the final private-beta authority and overlay lifecycle edge cases. Controlled acknowledgements
  now update rollback authority before motion can settle, controlled ownership handoff cannot accept a
  pending request, stale native dialog close events cannot finalize newer lifecycles, and Media Gallery
  normalization widens repaired base fields without losing literal IDs or consumer metadata.

## 0.1.0-beta.2

### Minor Changes

- Correct the pre-publication controlled-state contract. Component-originated selection and close
  events are now explicit requests, controlled semantic state remains prop-authoritative through
  ignored, delayed, or replaced requests, and rejected mechanics produce no false settlement or live
  announcement. Rename low-level nearest-anchor telemetry, align `navigateTo` vocabulary, make Media
  Gallery preserve the exact inferred item ID union through its full public surface, and strengthen
  packed TypeScript 6/7 consumer proof with library checking enabled.

## 0.1.0-beta.1

### Minor Changes

- Freeze the first public state contract around application-authoritative `activeId`, immediate
  semantic change events, later mechanical settlement, stable-ID Media Gallery routing, exact silent
  synchronization, shared navigation and close provenance, deliberate package entrypoints, and clean
  declaration reports. Upgrade repository TypeScript work to TypeScript 7 while using Vue Language
  Tools' supported TypeScript 6 bridge for SFC compilation and certify both consumer compiler lines.
