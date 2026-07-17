# Snap Motion

Snap Motion is a private interaction research and production workspace for interruptible
carousels and bottom sheets. It reconstructs the physical character of the earlier vSlides
experiment and combines it with the semantic snap-point, elasticity, and accessibility work
from a later bottom sheet.

This repository is not published to npm. Its internal package names are workspace-only.

## Workspace

- `packages/core` — framework-neutral geometry, target policy, velocity, elasticity, and scalar
  controller
- `packages/vue` — Vue state, Pointer Events, responsive measurement, and the imperative Motion
  spring driver
- `apps/lab` — media lightbox, paged-grid, variable-rail, and bottom-sheet tuning instrument
- `e2e` — Chromium, Firefox, and WebKit regression coverage
- `legacy` — frozen donor sources excluded from production tooling
- `docs` — architecture, interaction contracts, tuning guidance, and decisions

## Run it

Requires Node 24 or newer and the exact pnpm version declared in `packageManager`.

```sh
corepack enable
pnpm install
pnpm dev
```

Run the authoritative local gate with:

```sh
pnpm verify
```

## Architecture

Layout produces legal semantic anchors. Interaction policy selects an intended anchor. Motion
only carries one scalar position to that already-selected target. The framework-neutral core has
no Vue or DOM dependency; the Vue package owns DOM integration and delegates temporal settling to
the imperative `animate` API from Motion.

See [architecture](docs/architecture.md), [geometry](docs/geometry.md), and the
[interaction contract](docs/interaction-contract.md).

## Origin and direction

The source donors are the
[vSlides and VCarousel experiments](https://github.com/maikeleckelboom/new-design/tree/develop/src/components)
and the
[portfolio bottom sheet](https://github.com/maikeleckelboom/portfolio-2026-v1/tree/main/app/components/sheet).
Frozen source-level snapshots and factual provenance are kept in `legacy`.

The first intended production consumer is `maikel.site`. That future source-level integration
will keep gallery presentation, captions, visual treatment, and project data in the application;
Snap Motion will own physics, geometry, and Vue motion primitives. Integration is deliberately
outside this repository's current scope.
