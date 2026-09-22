# Snap Motion

Snap Motion is a public, MIT-licensed source repository for interruptible interactive surfaces. Its
framework-neutral core owns geometry, semantic surface state, and physical position; the Vue
integration turns those mechanics into carousels, stacked decks, coverflow rails, galleries,
dialogs, and sheets, using Motion as its imperative spring driver.

The reusable packages are currently beta candidates at `0.1.0-beta.10`. Their manifests
intentionally remain `private`, and neither package is published to npm.

## Quick start

The repository uses Node 24 and the pinned pnpm version for maintenance. Package consumers only
need ESM and Vue 3.5 or newer.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` starts the lab Vite server directly and resolves the workspace packages from source, so
package edits hot-reload without a build step. The lab opens as a human-facing showcase; Workbench
adds tuning and diagnostics for the same surfaces, while Fixtures exposes deterministic engineering
and certification harnesses. See [CONTRIBUTING.md](CONTRIBUTING.md) for the serve-only boundary that
keeps build and release validation on the distributable artifacts.

Import the minimal structural stylesheet once in an application entry:

```ts
import "@snap-motion/vue/style.css";
```

```vue
<script setup lang="ts">
import {
  CarouselNext,
  CarouselPrevious,
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue";
import { ref } from "vue";

const ids = ["overview", "system", "outcome"] as const;
const activeId = ref<(typeof ids)[number]>("overview");
</script>

<template>
  <CarouselRoot v-model:active-id="activeId" :ids="ids" label="Case study media">
    <CarouselPrevious />
    <CarouselViewport>
      <CarouselTrack>
        <CarouselSlide v-for="id in ids" :id="id" :key="id" :label="id">
          {{ id }}
        </CarouselSlide>
      </CarouselTrack>
    </CarouselViewport>
    <CarouselNext />
  </CarouselRoot>
</template>
```

The modal sheet uses physical sides and semantic visible extents:

```vue
<script setup lang="ts">
import { Sheet } from "@snap-motion/vue/sheet";
</script>

<template>
  <Sheet v-model:open="open" v-model:active-id="activeId" side="right">
    <template #title>Inspector</template>
    ...
  </Sheet>
</template>
```

## Workspace

- `packages/core` — zero-dependency geometry, target policy, velocity, elasticity, and controller
- `packages/vue` — feature-owned Vue APIs with package-internal accessibility, input, and layout
  capabilities
- `apps/lab` — one showcase/workbench/fixture application consuming public package entrypoints
- `apps/router-fixture` and `apps/nuxt-fixture` — routing, SSR, hydration, and fallback proof
- `e2e` and `fixture-e2e` — Chromium, Firefox, WebKit, Router, and Nuxt certification
- `etc` — tracked API Extractor reports

Run the authoritative gate with `pnpm verify`. It includes source tests, builds, API reports,
package size, actual packed tarball consumers, and browser suites.

Start with [getting started](docs/getting-started.md), then see the [component API](docs/components.md),
[keyboard contract](docs/keyboard.md), [package architecture](docs/package-architecture.md), and
[package contract](docs/package-contract.md). Automated
checks do not establish full accessibility; the unresolved physical test matrix is recorded in
[production certification](docs/production-certification.md).
