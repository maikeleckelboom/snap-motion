# @snap-motion/core

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
