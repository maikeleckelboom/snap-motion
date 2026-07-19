# Snap Motion

Snap Motion is a private, public-beta release candidate for interruptible Vue carousels, modal
lightboxes, and bottom sheets. The framework-neutral core owns semantic geometry and one scalar
physical position; the Vue package owns DOM integration and uses Motion as its imperative spring
driver.

The packages are not published. Their npm names are unverified and both manifests intentionally
remain `private`.

## Quick start

The repository uses Node 24 and the pinned pnpm version for maintenance. Package consumers only
need ESM and Vue 3.5 or newer.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

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

## Workspace

- `packages/core` — zero-dependency geometry, target policy, velocity, elasticity, and controller
- `packages/vue` — feature-owned Vue APIs with package-internal accessibility, input, and layout
  capabilities
- `apps/lab` — media, paged-grid, variable-rail, render-window, and bottom-sheet fixtures
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
