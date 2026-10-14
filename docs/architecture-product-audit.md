# Snap Motion — Architecture and Product Audit

Status: research report. Branch: `research/snap-motion-audit` (do not merge). Audit date: 2026-10-14.

This report distinguishes three kinds of statement:
- **Facts**: verified against source, tests, or executed commands.
- **Judgments**: architectural assessments based on those facts.
- **Proposals**: recommendations for future work; none is implemented here.

---

## 1. Executive summary

The repository contains an unusually mature **Vue-only** motion component library built on a genuinely
framework-neutral TypeScript core, with an exceptional verification culture. The stated product target —
a reusable, production-oriented component library with React and Vue as equally supported first-class
consumers — is **half built**.

Most important findings:

1. **The core is real.** `@snap-motion/core` (~5,000 lines, zero runtime dependencies, no DOM or Vue
   imports, ES2022-only lib) owns scalar physics, geometry, a generation-guarded interruptible
   controller, and two pure surface models. It is verified framework-agnostic, not merely claimed to be.
2. **React does not exist anywhere in the repository.** No `@snap-motion/react` package, no React
   dependency, no Next.js fixture, no docs mention. The React/Next.js half of the product direction is
   entirely aspirational today (Audit 3, severity critical).
3. **Vue integration quality is production-grade.** 11 headless carousel primitives plus Coverflow,
   StackedDeck, Sheet, ModalDialog and MediaGalleryDialog; verified SSR/hydration in Node, vue-router and
   Nuxt; packed-consumer certification including SFC type inference, TS 7, publint and ATTW; axe-gated
   e2e; 1,352 unit tests passing in this audit.
4. **The `motion` library is a one-file integration detail, not the engine.** The third-party `motion`
   package is imported only in `packages/vue/src/motion/motion-driver.ts:7`; the bounded spring used by
   Coverflow and the StackedDeck is integrated in-house from core. The product name oversells the
   dependency footprint.
5. **MediaGalleryDialog is the main architectural debt.** A 1,751-line component that hand-rolls its own
   gesture machine, its own track tween (VueUse `transition`), its own reduced-motion handling and its
   own message factory, bypassing the controller, the surface models, `useSnapMotion` and localization
   that every other surface uses (Audit 1/2/6).
6. **The Playground and Motion Studio are defensible but oversized.** ~19,000 lines of app code: a
   public Playground, an engineering Lab, and a genuinely distinctive A/B motion-decision Studio. The
   Studio has a real workflow and has forced real package fixes, but three parallel physics editors,
   duplicated strip-measurement and duplicated View Transition helpers are pure maintenance cost.
7. **Distribution is verified, not just configured.** Emitted-graph size checks prove `carousel`,
   `coverflow`, `dialog`, `sheet` and `media-gallery` entries do not drag in unrelated surfaces;
   `media-gallery` is isolated by a hard emitted-graph blocklist; packed tarballs were rebuilt and
   certified in this audit.

Bottom line: the architecture is worth evolving (option A, Audit 8). The single biggest product-level
mistake so far is not a bad component — it is that public-surface polish and demonstration work
(Playground, Studio, five spatial-surface demos) consumed the roadmap while the second first-class
consumer (React) was never started, so the library cannot currently serve half its stated market.

---

## 2. Current architecture map

### 2.1 Packages, modules, responsibility boundaries

Workspace (`pnpm-workspace.yaml:1-4`): `packages/*` and `apps/*`.

```
packages/core        @snap-motion/core@0.1.0-beta.14   (private, ESM, sideEffects:false, 0 runtime deps)
packages/vue         @snap-motion/vue@0.1.0-beta.14    (private, ESM, 9 subpath exports + style.css)
apps/lab             Playground + Motion Studio + engineering Lab (Vite multi-entry)
apps/router-fixture  vue-router authority/hydration fixture
apps/nuxt-fixture    Nuxt 4 SSR/hydration fixture
fixtures/            packed-consumer templates (Vite/Vue/Nuxt/TS7/min-Vue)
```

### 2.2 Dependency diagram

```
                    ┌──────────────────────────────────────────────┐
                    │ @snap-motion/core  (packages/core/src)       │
                    │  types, bounds, elastic, projection,         │
                    │  velocity, snap-targets, controller,         │
                    │  presets, kinetics, pagination, selection,   │
                    │  gestures, carousel-geometry, item-collection│
                    │  coverflow (+model), stackedDeck (+model)    │
                    │  animation-driver (driver contract)          │
                    └───────────────▲──────────────────────────────┘
                                    │ imports (runtime + types)
            ┌───────────────────────┴──────────────────────────────┐
            │ @snap-motion/vue (packages/vue/src)                  │
            │                                                      │
            │  motion/    useSnapMotion, motion-driver ("motion"   │
            │             pkg), bounded-spring-driver, reduced-    │
            │             motion, contracts                        │
            │  carousel/  useCarouselMotion (rail adapter), wheel, │
            │             keyboard, window, context, 11 components │
            │  coverflow/ useCoverflowMotion, Coverflow.vue        │
            │  stacked-deck/ useStackedDeckMotion, StackedDeck.vue │
            │  sheet/     useSheetMotion, policy, geometry, side,  │
            │             Sheet.vue, SheetSnapPicker.vue           │
            │  dialog/    ModalDialog.vue, contracts               │
            │  media-gallery/  MediaGalleryDialog.vue, math,       │
            │             track, images, tuning, messages          │
            │  localization/ messages                              │
            │  internal/  accessibility (focus, focus-restore,     │
            │             surfaceFocus), dom (realm), input        │
            │             (pointer-drag/policy, keyboard-policy,   │
            │             surface-gesture), layout (remeasurement, │
            │             measureSurfaceWidth), surface (config,   │
            │             diagnostics)                             │
            └───────────────▲──────────────────────────────────────┘
                            │ public entrypoints only
        ┌───────────────────┴──────────────┬────────────────────────┐
        │ apps/lab (Playground/Studio/Lab) │ apps/router-fixture     │
        │                                 │ apps/nuxt-fixture       │
        │ uses @snap-motion/vue/* and     │ (SSR/hydration proofs)  │
        │ @snap-motion/core directly      └────────────────────────┘
        └────────────────────────────────────────────────────────────┘
```

### 2.3 Observed facts

- Core is pure: all 21 modules import only `./`-relative specifiers (verified by grep); `tsconfig.base.json:7`
  sets `lib: ["ES2022"]` with no DOM; core tests run in a Node environment (`packages/core/vite.config.ts`).
- The `SnapController` (`packages/core/src/controller.ts:117-152`) owns phases `idle | dragging |
  settling`, driver playback, interruption via playback generations (`:610-615`), remeasurement with
  semantic-ID rebasing (`:366-450`), and drag envelopes. It implements the `AnimationDriver` contract
  (`packages/core/src/animation-driver.ts:17-19`).
- `StackedDeckModel` (`stacked-deck-model.ts:157-411`) and `CoverflowModel` (`coverflow-model.ts:102-236`)
  are pure snapshot reducers; neither imports the controller. The Vue adapters
  (`use-stacked-deck-motion.ts:361-368`, `use-coverflow-motion.ts:202-209`) are the composition root.
- Vue composition chain: `StackedDeck → useStackedDeckMotion → useCarouselMotion → useSnapMotion →
  SnapController`; `Sheet → useSheetMotion → useSnapMotion`. MediaGalleryDialog does **not** participate
  (`packages/vue/src/media-gallery/useGalleryTrack.ts:1` uses VueUse `transition`; no `SnapController`
  import exists under `media-gallery/` — verified by grep).
- Boundary enforcement is automated: `scripts/check-architecture.mjs` rejects core runtime imports,
  feature cross-implementation edges, cycles, wildcard entrypoint exports and apps consuming package
  `src`. Executed in this audit: "Architecture checks passed for 97 package source modules with an
  acyclic dependency graph."
- Public API is API-Extractor-frozen per entrypoint (`etc/core.api.md`, `etc/vue*.api.md`, 10 reports).

### 2.4 Does the architecture genuinely support framework-agnostic consumption?

**Yes for the engine, partially for the layers above it.** Core is provably independent of any
framework. The framework-specific layer (Vue) owns what should be framework-specific: pointer binding,
measurement, reactivity, lifecycle. A React adapter could consume the same core and driver contract
unchanged. What would be duplicated in a React port is the 12,340-line Vue layer: rail adapter,
gesture recognizers, focus policy, surface-gesture, remeasurement, plus five high-level components.
None of that logic currently exists in a shared, framework-neutral form, so a React adapter is a real
port, not a thin re-export. Judgment: the architecture *enables* independent consumption; it does not
yet *deliver* it.

### 2.5 Duplicated logic, dead code, unnecessary abstraction

- MediaGalleryDialog duplicates gesture arbitration, settling state machine, reduced-motion handling
  and messaging (Section 2.3, 2.5.1 below).
- The controlled-selection authority pattern (`intendedId` / `semanticActiveId` /
  `latestValidAuthorityId` / microtask settlement publishing) is repeated near-verbatim in
  `CarouselRoot.vue:79-202`, `Coverflow.vue:80-207`, `StackedDeck.vue:103-235`, `Sheet.vue:142-246` and
  `MediaGalleryDialog.vue:134-401`. It is a deliberate, documented pattern, but it is the largest
  repeated block in the package and has no shared home.
- `useCoverflowMotion` and `useStackedDeckComponentMotion` share near-identical scaffolding
  (measurement, bounded driver, configuration keying, surface-gesture wiring, diagnostics).
- Three near-identical control-ownership selectors: `internal/input/keyboard-policy.ts:45-52`,
  `internal/input/pointer-policy.ts`, `carousel/carousel-wheel-policy.ts`.
- Core dead exports (exported from `src/index.ts` but with no consumer in core or Vue):
  `resolveCoverflowModularProgress` (deprecated, unreachable), `resolveProgrammaticTarget`,
  `isWithinBounds`, `VelocityTracker.getSamples`, `createSymmetricElasticity`, `balancedPreset` /
  `heavyPreset` / `loosePreset` (only `tightPreset` is consumed), `resolveStackedDeckOrder`.
  `createPagedGridGeometry`/`calculateFixedCellSize` have exactly one consumer — the Playground demo
  `apps/lab/src/demos/PagedGridDemo.vue:2` — no package consumer.

---

## 3. Component inventory and product-value assessment

### 3.1 What actually exists (facts)

| Component / primitive | Where | Kind | Verified consumer surface |
|---|---|---|---|
| Carousel primitives (Root, Viewport, Track, Slide, Previous, Next, Pagination(+Item), Progress, ActivePosition, Status) | `packages/vue/src/carousel/components/` | Production, headless | router-fixture, nuxt-fixture, packed consumers |
| `useCarouselMotion` + geometry strategies | `packages/vue/src/carousel/` | Production composable (the documented escape hatch) | Playground demos, Studio MediaCarousel |
| Coverflow | `packages/vue/src/coverflow/` | Production surface component | Playground, Lab |
| StackedDeck (shuffle + direct exchange) | `packages/vue/src/stacked-deck/` | Production surface component | Playground, Lab, Studio |
| Sheet (+ SheetSnapPicker, snap policies) | `packages/vue/src/sheet/` | Production component | Playground, Lab, Studio, nuxt-fixture |
| ModalDialog | `packages/vue/src/dialog/` | Production component | all apps |
| MediaGalleryDialog (lightbox with zoom/pan/swipe/pinch) | `packages/vue/src/media-gallery/` | Production component (subpath-only) | Playground, Lab AT harness, nuxt-fixture |
| Paged Grid | **No package component exists.** `createPagedGridGeometry` (core) + `PagedGridDemo.vue` (lab) | Demonstration only | Playground section 03 |
| Lightbox/pan-zoom outside gallery | `MediaLightboxDemo.vue` (2,121 lines, lab) + `media-inspection/*` | Demonstration/engineering | Playground section 04, Lab |
| Coverflow rail resolver, deck frame projection | `packages/core/src/coverflow.ts`, `stackedDeck.ts` | Production primitives | Vue surfaces |

There is **no** standalone Gallery/lightbox component other than `MediaGalleryDialog`; the "gallery"
in the Playground is demo code built on `useCarouselMotion` plus lab-owned zoom/pan math
(`media-inspection/use-media-transform.ts`, 293 lines).

### 3.2 Rubric

Scores 1–5 (5 = best) per criterion: **Reuse** (can a consumer integrate it without Playground markup),
**Integration** (API quality: controlled/uncontrolled, typing, events), **Distinctive** (does it do
something ordinary libraries do not), **Complexity** (inverse of API/surface complexity, 5 = simple),
**Burden** (inverse of maintenance burden, 5 = low).

| Asset | Reuse | Integration | Distinctive | Complexity | Burden | Verdict |
|---|---|---|---|---|---|---|
| Carousel primitives | 5 | 5 | 3 | 4 | 4 | **KEEP** |
| `useCarouselMotion` | 5 | 4 | 4 | 3 | 4 | **KEEP** (promote in docs) |
| Coverflow | 4 | 4 | 4 | 3 | 4 | **KEEP** |
| StackedDeck | 4 | 4 | 5 | 2 | 2 | **KEEP** (largest single feature; consider SIMPLIFY of direct-exchange tuning surface) |
| Sheet | 5 | 5 | 4 | 4 | 3 | **KEEP** |
| ModalDialog | 5 | 5 | 3 | 5 | 5 | **KEEP** |
| MediaGalleryDialog | 4 | 4 | 3 | 2 | 1 | **KEEP, SIMPLIFY later** (own stack duplicates everything; see 6.3) |
| `createPagedGridGeometry` | 2 | 3 | 2 | 4 | 4 | **COMPOSE** (only demo consumer today; either ship a real PagedGrid primitive or demote to lab) |
| `MediaLightboxDemo` + media-inspection | 1 | — | 2 | 1 | 1 | **RETIRE from public surface** (Playground demo; zoom/pan math should live in a package primitive or stay lab-only) |
| PagedGridDemo | 1 | — | 2 | 2 | 2 | **RETIRE as demo** (fold into docs examples if a primitive ships) |
| DefaultSurfacesDemo | 2 | — | 3 | 5 | 5 | **KEEP** (zero-config consumer-contract evidence; move into docs) |

### 3.3 Production vs experimental vs showcase-only

- **Production**: all six `packages/vue` capability entries + core. Certified by packed consumers,
  e2e, and axe gates.
- **Engineering/certification**: the six fixture demos in `apps/lab/src/demos/`
  (`sheetContentFixture`, `OverlayLifecycleFixture`, `VariableRailFixture`,
  `stacked-deck-overflow-fixture`, `realm-overlay-fixture`, `RenderWindowFixture`) and the
  `MediaGalleryAtCertificationDemo` AT harness. These are test harnesses, correctly hidden behind the
  Lab's Fixtures view (`fixtures/demo-registry.ts`, `audience: "fixture"`).
- **Showcase**: Playground chrome, tuning panels, seeded SVG "screen" content, and the Studio's
  "Ridge Crew" narrative.

### 3.4 Per-feature notes (facts + judgment)

- **Coverflow** and **StackedDeck** are complete spatial surfaces: typed items, controlled selection,
  per-card slot state, handles, presentation CSS variables (`--snap-motion-coverflow-*`,
  `--snap-motion-deck-*`). Genuinely distinctive (cyclic deck ring with paint-layer resolution,
  `resolveStackedDeckFrame`, core `stackedDeck.ts:1460`).
- **Sheet** is a native `<dialog>` with side-parameterized snaps, a radio snap picker and host-owned
  adaptive presentation; this is the most consumer-ready component in the package.
- **Carousel primitives** are correctly headless; `CarouselSlide` inertness is right for galleries
  but is the documented reason the Studio built its own strip on `useCarouselMotion` (`docs/motion-studio.md:93-107`).
- **Paged Grid** does not exist as a component. Naming it in the product brief overstates the library.

---

## 4. React / Vue parity matrix

**Fact: React support is absent.** There is no React package, no React dependency, no Next.js fixture,
no React tests, and no mention of Next.js anywhere in the repository (verified by grep across manifests
and docs). A parity matrix therefore degenerates into "Vue: complete; React: nothing."

| Dimension | Vue | React | Evidence |
|---|---|---|---|
| Package | `@snap-motion/vue` (9 subpaths) | none | `packages/vue/package.json:35-73` |
| Components | 15+ production components | none | `packages/vue/src/index.ts:9-59` |
| Composables | carousel/coverflow/deck/sheet/motion/window | none | per-feature `index.ts` files |
| Controlled/uncontrolled | `v-model`, one-way prop + request events + `synchronizeTo` | none | `docs/components.md:62-79` |
| Lifecycle/cleanup | verified (focus restore, pointer capture, RAF clocks) | none | `packages/vue/src/internal/`, tests |
| Accessibility | axe gates, keyboard cert, forced-colors, 44px targets | none | `e2e/accessibility.spec.ts` etc. |
| Typing | SFC inference certified by packed `vue-tsc` consumers | none | `fixtures/packed-consumers/src/Inference.vue` |
| SSR/hydration | Node/vue-router/Nuxt, 3 engines | none (Next.js absent) | `fixture-e2e/`, `ssr-render.test.ts` |
| Test coverage | 45 unit test files + 42 e2e specs | none | directory listings |
| Dependencies crossing boundaries | core is framework-neutral; `motion` driver contract is framework-neutral | — | `packages/core/src/animation-driver.ts` |

**Judgment**: Vue is a genuine first-class citizen with first-class verification. React is not a
second-class citizen — it does not exist. The framework-neutral core is the one asset that makes a
React adapter tractable: controller, models, selection, kinetics, gesture *policy*
(`resolveDirectManipulationGesture`, `resolveSnapKeyboardAction`), presentation resolvers and the
driver contract are all reusable as-is. A React adapter would port: `useSnapMotion` binding, pointer
drag recognizer, wheel policy, surface gesture, focus policy, remeasurement, and the component layers.

Accidental-vs-idiomatic divergence is not applicable today; when a React adapter is built, the
following asymmetries already documented in the Vue API must be decided deliberately rather than
copied blindly: the `v-model`/request-event/`synchronizeTo` three-way authority protocol, the
`activeIdRequest` + `settled` provenance events, and the root-entrypoint curation strategy.

---

## 5. SSR and hydration findings and evidence

Verdict summary: **Vue SSR/hydration: VERIFIED. Next.js: UNVERIFIED (absent).**

### 5.1 VERIFIED items (executed in this audit)

| Claim | Status | Evidence |
|---|---|---|
| No browser globals during module evaluation / render | VERIFIED | `packages/vue/test/ssr-render.test.ts` asserts `globalThis.window` undefined (`:133`); core lib is ES2022-only; packed `fixtures/packed-consumers/ssr.mjs` renders all six surfaces via `renderToString` and passed |
| Deterministic server output | VERIFIED | same test asserts deterministic cross-request markup + unique `useId` relationships (`ssr-render.test.ts:154-163`); passed |
| No server-rendered `open` attribute on `<dialog>` | VERIFIED | `ssr-render.test.ts` + `ssr.mjs` assertions; passed |
| Reduced-motion first-render determinism | VERIFIED | `packages/vue/src/motion/reduced-motion.ts:11-20` (SSR guard, deferred adoption); 48 preference cells × 3 engines passed against the **packed** Nuxt build (executed `verify:packages:browser:prepared`) |
| Vue Router hydration + authority handoff | VERIFIED | `fixture-e2e/routing-hydration.spec.ts:14-107` (push/replace/Back/direct entry, delay/refuse policies); 12/12 fixture tests passed |
| Nuxt hydration without `ClientOnly`, zero hydration warnings | VERIFIED | `routing-hydration.spec.ts:109-124`; packed Nuxt hydration in chromium/firefox/webkit passed |
| Meaningful content without JavaScript | VERIFIED | `routing-hydration.spec.ts:200-211` (JS-disabled full media route); passed |
| Adaptive sheet: one host, focus transfer across breakpoint | VERIFIED | `routing-hydration.spec.ts:213-236`; passed |
| SSR geometry: deterministic zero-width anchors, ID-preserving first placement | PARTIALLY VERIFIED | contract in `docs/architecture.md:134-136`; unit coverage in `ssr-render.test.ts`; consumer-level placement is e2e-covered by fixture tests, but the exact "no entrance spring on first measure" behavior is unit-covered only |
| Cleanup/remount | PARTIALLY VERIFIED | covered by `overlay-lifecycle.spec.ts`, focus-restore unit suite; not exhaustively exercised in this audit's e2e slice |
| Next.js integration | UNVERIFIED | no fixture, no docs, no code exists |

### 5.2 Evidence gaps

- No React/Next.js SSR evidence of any kind (structural absence, not a failing check).
- `playwright.preview.config.ts` (built preview under non-root base) was not re-executed in this
  audit; it is part of the standard gate.
- The visual review suites (`playwright.*-visual.config.ts`) were not re-executed.

---

## 6. Tree-shaking and distribution findings and evidence

### 6.1 Configuration (facts)

- Core: single `.` export, `sideEffects: false`, ESM-only (`packages/core/package.json:27-36`).
- Vue: 9 capability subpaths + `./style.css`; `sideEffects: ["**/*.css"]`
  (`packages/vue/package.json:29-73`). Root entry is deliberately curated smaller than the union of
  subpaths (`packages/vue/src/index.ts:9-59`).
- CSS is never auto-imported by JS (`docs/styling.md:2-5`).
- Declarations: API Extractor rolls each entrypoint into one self-contained `.d.ts`; no relative
  edges ship (verified by `scripts/verify-packages.ts:92-100` in this audit).

### 6.2 Verified evidence (executed in this audit)

`pnpm size:check` resolves and measures the emitted per-entry import graph with hard entry-edge
enforcement (`scripts/check-size.mjs:26-33`) and a media-gallery emitted-edge blocklist (`:37-55`):

| Entry | Emitted graph pulls | Raw / gzip |
|---|---|---|
| core | single file | 56.2 / 16.3 kB |
| vueRoot | all shared chunks (carousel, coverflow, deck, sheet, dialog, motion) | 144.8 / 38.9 kB |
| carousel | carousel, realm, messages, surfaceFocus, remeasurement, use-snap-motion — **no other surface** | 39.1 / 11.2 kB |
| coverflow | coverflow, focus, realm, surfaceFocus, diagnostics, bounded driver — no sheet/deck/gallery | 50.5 / 14.9 kB |
| stacked-deck | deck + same shared set | 61.4 / 18.0 kB |
| sheet | sheet, focus, focus-restore, realm, messages, remeasurement, use-snap-motion | 53.1 / 15.1 kB |
| dialog | dialog, focus, realm, focus-restore, messages (no motion stack) | 11.8 / 3.9 kB |
| media-gallery | gallery + realm/focus/focus-restore only | 58.4 / 16.0 kB |
| motion | motion, use-snap-motion, realm, bounded driver | 10.8 / 3.7 kB |
| style.css | — | 26.9 / 4.7 kB |

Packed-consumer certification passed in this audit (`pnpm verify:packages`): publint strict, ATTW
across all 9 Vue entrypoints (ESM/node16/bundler green), a direct core runtime consumer, a TS 7
declaration consumer under bundler/node16/nodenext, and a minimum-Vue (3.5.0) consumer with real SFC
generic inference (`Inference.vue`), Vite build and SSR render. `verify:packages:browser` rebuilt the
packed tarball through Nuxt and certified hydration in all three engines.

### 6.3 Judgments

- A consumer importing `@snap-motion/vue/carousel` **verified** drags in no Coverflow, Deck, Sheet,
  Gallery or Dialog code. A consumer importing `media-gallery` drags in no motion stack — but that
  isolation exists precisely because the gallery re-implements its own motion (the flip side of the
  Audit 1 finding).
- `@vueuse/core` and `motion` are package dependencies of the whole Vue package, so an npm install
  always fetches them, even though `motion` is used by one file. Tree-shaking removes them from
  bundles that do not use them (the dialog entry's emitted graph contains neither), but dependency
  install weight is unconditional. Low severity today; consider making `motion` optional/peer when
  the bounded driver is the default.

---

## 7. Interaction and accessibility assessment

### 7.1 What genuinely differentiates Snap Motion (facts)

- **Interruptible, generation-guarded playback**: stale driver callbacks cannot act after
  interruption (`controller.ts:544-549,562,570,610-615`); every input interrupts current playback;
  no queues (`docs/interaction-contract.md:3-7`).
- **Remeasurement as a controller transition** with semantic-ID rebasing and pointer-relative
  displacement preservation while dragging (`controller.ts:366-450`).
- **One-adjacent-card interaction envelope** and paint-layer-resolved deck exchanges
  (`stacked-deck-model.ts`, `resolveStackedDeckFrame`); Direct-exchange paint-order certification via
  compositor matrices (`docs/production-certification.md:48-60`).
- **Durable vs visual selection**: settled selection, hysteresis, and announcement timing are
  separated (`selection.ts:35-105`); the Studio e2e suites assert frame-accurate caption behavior.
- **Verified focus lifecycle** on native `<dialog>`: opener capture, explicit initial focus,
  native-tab containment with only boundary interception, verified focus restoration with bounded
  repair (`focus-restore.ts:81-236`).
- **Pointer hygiene**: pointer capture ownership rules, lost-capture semantics, touch intent
  arbitration (1.25 dominance ratio, 8 px threshold), tap-vs-drag via core gesture policy.

### 7.2 Accessibility facts

- axe gates exist for: lightbox open/closed, every active slide, paged/inert grids, all sheet snaps,
  reduced motion, mobile, 200%/400% zoom, forced colors (`e2e/accessibility.spec.ts`,
  `playground-layout.spec.ts`, `studio-layout.spec.ts`, `coverflow-gallery.spec.ts:1311`,
  `media-gallery-at-harness.spec.ts:225`). Executed slice in this audit passed.
- Reduced motion: tri-state (`system`/`true`/`false`), live adoption, deterministic completion;
  drag is never disabled (`docs/interaction-contract.md:68-73`).
- Physical assistive-technology certification (NVDA/Firefox, NVDA/Chrome, VoiceOver/Safari,
  VoiceOver/iPhone, TalkBack/Android) is **prepared but not executed** — a standing release blocker
  (`docs/release-blockers.md:8-18`, `docs/production-certification.md:244-260`).

### 7.3 Known weaknesses (facts)

- ~220 ResizeObserver-loop diagnostic entries in Coverflow/StackedDeck scenarios recorded as baseline
  in prior verification runs (`docs/production-certification.md:83-84, 201-203`). Not proven harmful;
  not proven harmless.
- Two documented baseline test flakiness defects (position-sample readiness in
  `stacked-deck-direct.spec.ts:795`; a 2-pixel screenshot envelope exceedance in
  `stacked-deck-pile.spec.ts:79`) remain open (`docs/production-certification.md:185-217`).
- MediaGalleryDialog duplicates gesture arbitration and reduced-motion handling instead of reusing
  the shared stack — the largest accessibility-relevant maintenance risk, because fixes to shared
  focus/gesture policy do not automatically reach it (focus code is shared; gesture code is not).
- Gallery-above-Sheet and two simultaneous Galleries are explicitly uncertified
  (`docs/components.md:184-188`).

### 7.4 Infrastructure we are arguably rebuilding (judgment)

- **Native `<dialog>` focus containment**: the package correctly reuses the browser's modal
  semantics and only intercepts first/last Tab boundaries — appropriate, not rebuild.
- **Focus trap/restore for a future React adapter**: the Vue focus machinery (~500 lines across
  `focus.ts`/`focus-restore.ts`/`surfaceFocus.ts`) is Vue-adjacent but mostly DOM-level. For React,
  prefer mature primitives (e.g. an existing a11y focus utility or native-dialog behavior) over a
  second in-house copy; only the Snap-Motion-specific parts (focus while a spring is in flight,
  focus completion of a semantic snap) are genuinely in-house.
- **View Transition helpers** exist twice in the lab (`media-inspection/media-transition.ts`,
  `playground/studio/studio-transition.ts`) — demo-layer duplication, not package concern.

---

## 8. Playground / Motion Studio keep-versus-remove analysis

### 8.1 Who each surface is for (facts)

| Surface | Audience | Task |
|---|---|---|
| Playground (`/playground/`) | External developers evaluating the library | See six sections, tune shared physics, Studio A/B decision |
| Engineering Lab (`/lab/`) | Maintainers | Workbench diagnostics, certification fixtures, AT harness, per-surface physics probes |
| Motion Studio (Playground section 06) | Developers/designers choosing motion behavior | Shortlist candidates → pin A → tune B → compare on a real task → record decision + implementation snippet |

### 8.2 Answers to the product questions

1. **Who is each section for?** Sections 01–05 target external evaluators; section 06 targets
   evaluators making a real decision; the Lab targets maintainers.
2. **What can a developer accomplish?** In the Playground: learn the surfaces, feel physics
   presets, test keyboard/drag behavior, and (Studio) arrive at a concrete candidate + code. In the
   Lab: reproduce and inspect failures with live telemetry.
3. **Which interactions teach or verify meaningful behavior?** Coverflow drag/flick/keys, deck
   exchange comparison, sheet snap behavior, gallery zoom/pan — all meaningful. The tuning panels
   teach the physics contract (`LabPhysicsSettings`, 11 parameters).
4. **Which controls exist mainly because the engine exposes parameters?** The 11-parameter physics
   editors (stiffness, damping, mass, fling velocity, release projection, elastic edge, control
   impulse, max step, etc.) exist because the engine exposes them; they are duplicated three times:
   Lab `PhysicsControls`/`PhysicsField`, Playground `MotionTuning`/`TuningPanel`, Studio
   `StudioTuneB` (only `PhysicsGroups` is shared).
5. **Where is functionality duplicated across demos and Studio?** Media strip/gallery appears in
   five places (`MediaLightboxDemo`, `MediaCarousel`, `VariableRailFixture`, `PagedGridDemo`,
   `CoverflowDemo`); physics mapping three times (`lab-settings.ts`, `use-studio-physics.ts`,
   `SheetDemo.vue` inline); View Transition helpers twice; "screen" content twice
   (`showcaseScreens.ts` vs `demoScreens.ts`).
6. **What is useful for internal research but not public docs?** The six certification fixtures,
   the AT harness with fake `__at-media__` endpoints, `DiagnosticsPanel` telemetry, physics probe
   controls. All are correctly Lab-scoped already.
7. **What would developers need to integrate into a real app?** Install instructions (exist,
   `docs/getting-started.md`), per-component docs with copy-pasteable examples (do not exist as a
   doc site; only markdown), Nuxt guidance (exists), and — for half the target audience — a React
   package (does not exist).
8. **Which Studio features are worth preserving?** The A/B workflow itself (shortlist → pinned
   reference → editable B → difference reading → decision + implementation snippet), the
   declared/calculated/authored separation, replay-with-interruption, and the frame-accurate tests.
   Not worth preserving publicly: the "Ridge Crew" narrative chrome, the duplicate tuning editor,
   the duplicate strip measurement (`media-strip.ts` vs `VariableRailFixture.measureBoxes`).

### 8.3 Verdict on the Studio (judgment)

The Studio has a **distinct, defensible workflow** — no ordinary component library offers motion
A/B decision support, and the Studio has demonstrably improved the package (it forced the
settlement-authority race fix, `docs/motion-studio.md:286-291`). The hypothesis that it "adds little
value" is **not confirmed**: its value is real but internal. Recommended disposition:

- **KEEP** the Studio as an internal research/dogfood product, moved out of the public Playground's
  primary path (e.g. behind the Lab or a "research" area).
- **KEEP** its tests (they are package stress tests in disguise).
- **SIMPLIFY** the public Playground to section-level component demos + realistic examples.
- **RETIRE from the public surface**: the Studio narrative chrome, the third tuning editor copy, the
  duplicated strip-measurement and View Transition helpers.
- **CONVERT** the implementation-snippet feature into real per-component documentation with
  copy-paste examples (it is already 80% of the content).

---

## 9. Architectural risks and technical debt, ranked by severity

Ranking: Critical > High > Medium > Low.

1. **No React/Next.js consumer exists** (Critical, product). React and Next.js are named
   first-class targets; nothing exists. Confidence: certain.
2. **MediaGalleryDialog owns a parallel motion stack** (High, architecture/maintenance).
   1,751-line component + 460-line math + own gestures/tween/reduced-motion/messages; fixes to the
   shared stack do not reach it; it is the largest single maintenance surface in the package.
   Confidence: certain.
3. **Physical assistive-technology certification unexecuted** (High, release). The repo's own
   release-blocker list (`docs/release-blockers.md`) gates publication on NVDA/VoiceOver/TalkBack
   runs that have not happened. Confidence: certain.
4. **Five-fold repetition of the controlled-selection authority protocol** (Medium, maintenance).
   Deliberate and tested, but any change to the authority contract touches five components plus
   their tests.
5. **Huge lab surface (~19,000 lines) with triplicated editors and duplicated measurement/transition
   helpers** (Medium, maintenance + velocity). Confidence: certain.
6. **Two documented baseline test flakiness defects remain open** (Medium, CI health).
   Confidence: high (documented by the repo, not re-triggered here).
7. **~220 ResizeObserver-loop diagnostics as unclassified baseline** (Medium, correctness/perf
   unknown). Confidence: high that they occur; low that they are harmless.
8. **Dead public core exports** (Low-Medium). Public API of a library that has not shipped; cleaning
   now is cheap, later it is semver. Confidence: certain.
9. **Unconditional `motion` dependency** (Low). Used in one file; the bounded driver already
   supersedes it for the spatial surfaces. Confidence: certain.
10. **Unpublished, unverified npm ownership; version 0.1.0-beta.14** (Low for code, High for
    go-to-market). Confidence: certain.

---

## 10. Recommended target architecture and alternatives

### 10.1 Target shape (proposal)

```
packages/core          unchanged (already the shared behavior layer)
packages/vue           unchanged boundaries; internal dedup work only
packages/react         NEW adapter: motion driver + carousel primitives + sheet/dialog/coverflow/deck
apps/docs              component documentation site with realistic examples (reuse Playground demos)
apps/lab               remains: engineering workbench + fixtures + Studio (internal)
apps/nuxt-fixture      remains; add apps/next-fixture once React lands
```

Guiding rules:
- Core stays the only owner of physics, geometry, models, selection, kinetics, gesture *policy* and
  the driver contract. No new physics moves into adapters.
- Each framework adapter owns: reactivity binding, pointer/wheel binding, focus policy binding,
  remeasurement, and framework-idiomatic component layers.
- **Reuse mature ecosystem primitives for React dialog/focus** (native `<dialog>` plus a known a11y
  utility) rather than porting the Vue focus internals wholesale; port only the Snap-Motion-specific
  parts (settlement-aware focus, snap-completion focus).
- No new package boundaries beyond `packages/react`. Splitting gestures, focus, or shared hooks into
  their own packages adds semver and ownership cost without a second consumer to justify it.
- Component-level imports stay the norm (React subpath exports mirroring the Vue map:
  `@snap-motion/react/carousel`, `/sheet`, `/dialog`, `/coverflow`, `/stacked-deck`,
  `/media-gallery`, `/motion`, `/localization`).

### 10.2 What already fits this model (facts)

The vanilla core (Audit 1), the driver abstraction (`animation-driver.ts`), the headless carousel
primitive set, the localization factory, and the style-light structural CSS (CSS variables, no
palette) all fit as-is. The Vue layer's *shapes* (rail adapter, per-surface composable, handle
contracts) are the template for the React adapter.

### 10.3 Strategy A — Evolve the existing architecture incrementally (recommended)

- Add `@snap-motion/react` as a sibling adapter consuming the same core; port `useSnapMotion` →
  `useSnapMotion` (React hook), `useCarouselMotion` → hook, and components as React equivalents.
- Extract, inside `packages/vue`, the repeated authority protocol into one shared internal module
  (mechanical refactor, no API change).
- Merge media-gallery's motion onto the shared controller stack opportunistically (or explicitly
  defer it; see roadmap).
- Benefits: zero disruption to the certified Vue package; core earns its name by serving two
  adapters; every parity fix pays for both frameworks. Migration cost: low for the existing Vue
  surface (internal refactors only). Compatibility risk: none for consumers (nothing published).
- Cost: the React port itself is the work (~months); nothing about the current architecture makes
  it harder than it should be.

### 10.4 Strategy B — Structural separation (rejected for now)

Splitting into `@snap-motion/gestures`, `@snap-motion/focus`, `@snap-motion/headless-*`, etc.
- Benefits: cleaner ownership if three or more adapters (React, Vue, Svelte, Solid) become real.
- Costs: semver matrix, cross-package testing explosion, packing/verification pipeline expansion,
  no demonstrated consumer.
- Verdict: not justified by evidence. Revisit only if a third framework adapter is actually funded.

### 10.5 Decision

**Strategy A.** Favor evolution. The existing boundaries are enforced by tooling, the core is
provably portable, and the missing piece is a sibling package, not a restructure.

---

## 11. Phased roadmap

### NOW (immediate)

1. Stand up `@snap-motion/react` skeleton: `motion` adapter (`useSnapMotion` hook + drivers) and
   `dialog` (`ModalDialog`) + `carousel` primitives, with subpath exports and the same
   packed-consumer treatment (React SFC typing check, SSR render, Next.js fixture).
2. Add a Next.js fixture mirroring `apps/nuxt-fixture` (app-router page with carousel/dialog, zero
   hydration warnings, JS-disabled meaningful route).
3. Extract the repeated controlled-authority protocol into a shared internal Vue module (no public
   API change).
4. Remove the dead core exports listed in 2.5 (packages are unpublished; no compat facade needed —
   consistent with `docs/package-architecture.md:162-163`).
5. Fix the two documented flaky tests (readiness threshold; pile envelope oracle).
6. Decide Studio placement: keep as internal tool (recommended) and cut the public narrative chrome
   and the third tuning-editor copy.

### NEXT

7. React parity for Sheet, Coverflow, StackedDeck and MediaGalleryDialog, mirroring the Vue
   contracts; decide authority protocol idiom per framework (controlled props + request callbacks;
   no blind `v-model` translation).
8. Component documentation site (`apps/docs`) built from the Playground demos and the Studio's
   implementation snippets; retire the public Playground duplication it replaces.
9. Retire `MediaLightboxDemo`/`PagedGridDemo` from the public surface (fold into docs examples or
   Lab fixtures).
10. Execute the physical AT certification matrix (release blocker).

### LATER

11. Refactor MediaGalleryDialog onto the shared controller/gesture stack (or justify keeping its
    own; document the decision in an ADR).
12. Decide on a real Paged Grid primitive (compose from `useCarouselMotion` + core geometry) or
    demote `createPagedGridGeometry` to lab-only.
13. Optional styled recipes for the headless carousel primitives once docs prove demand.
14. Evaluate making `motion` a peer/optional dependency as the bounded driver becomes default.

### NOT RECOMMENDED (until the above are done)

- More spatial surfaces, motion presets, or showcase demos.
- Multi-package restructuring (Strategy B).
- An in-house React focus trap or dialog manager.
- Studio persistence, accounts, or data export.
- Public npm publication (blocked by the AT gate anyway).

---

## 12. What we should stop building

Evidence supports stopping the following:

1. **More motion demonstrations and spatial-surface variants.** Five gallery/strip implementations
   and five StackedDeck host layers already exist; 43 of the last 200 commits are stacked-deck
   scoped. The marginal value of another demo is negative relative to a missing React adapter.
2. **Additional copies of the physics tuning editor.** Three exist; the parameter surface is
   stable (`fixtures/physics-parameters.ts`). Consolidate on `PhysicsGroups`; delete the copies.
3. **More certification fixtures and visual-review scenarios** (seven visual configs, six
   fixtures). Each new scenario adds CI cost; current coverage already exceeds what the next
   milestone (React parity) needs.
4. **New in-house infrastructure that the platform provides**: native `<dialog>` semantics are
   correctly reused; do not grow an overlay manager, global focus trap, or scroll-lock framework.
   The uncertified Gallery-above-Sheet composition should remain unsupported rather than funded.
5. **Public-facing Studio features** (persistence, sharing, more candidates) — the Studio is an
   internal research instrument, not a product.

---

## 13. Explicit assumptions, unverified claims, open questions

### Assumptions

- The product direction in the brief (React + Vue first-class, SSR out of the box, reusable
  components as the product) is accurate and current.
- Docs claims are trusted only where corroborated by source or executed checks; where a doc claims
  something this audit did not re-execute, it is marked as such below.
- The uncommitted work-in-progress on `feat/studio-item-carousel` (main worktree) is not part of
  this audit; the research branch is at `94dca5e`.

### Unverified / not re-executed in this audit

- Full browser matrix (`firefox`, `webkit`, `webkit-stacked-deck-*`, studio groups, visual
  reviews). Prior green runs are documented in `docs/production-certification.md` but were not
  re-run here.
- `playwright.preview.config.ts` (built preview under `/snap-motion/` base).
- `release:check` / release-candidate workflow end-to-end.
- Claims about ResizeObserver-loop counts, RAF timings, and the two flaky defects are taken from
  the repository's own records, not re-measured.

### Open questions

1. Who is the audience for the next 6 months: Vue-only consumers (then React parity is
   over-scoped), or the stated dual-framework market? This decides roadmap ordering.
2. Should the Studio stay public in the Playground or move behind the Lab? (Recommendation: Lab.)
3. Is `MediaGalleryDialog`'s independent motion stack acceptable in exchange for its emitted-graph
   isolation, or must it converge on the shared controller?
4. Does the `motion` dependency remain a product constraint (name alignment) or become optional?
5. npm scope/name ownership for `@snap-motion/*` is unverified — is the org account secured?

---

## 14. Validation log

Environment: Windows 11, Node v24.19.0, pnpm 11.13.1. Clean worktree
`C:\dev\snap-motion-audit` at commit `94dca5e` (branch `research/snap-motion-audit`), `pnpm install
--frozen-lockfile` (815 packages). All commands below were executed there; nothing was fixed or
skipped.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | passed (15.7 s, store cache) |
| 2 | `pnpm test:unit` | **1,352 passed / 94 files** (core 265, vue, lab, scripts, vue-ssr) |
| 3 | `pnpm lint` (oxlint + `architecture:check`) | passed; 0 warnings/errors; "97 package source modules, acyclic" |
| 4 | `pnpm build:packages` | passed; core 56.24 kB / 16.51 kB gzip; vue 9 entries + style.css |
| 5 | `pnpm typecheck:prepared` | passed (core tsc, vue vue-tsc, lab, router-fixture, nuxt typecheck, scripts) |
| 6 | `pnpm api:check:prepared` | passed (API Extractor reports match `etc/*.api.md`) |
| 7 | `pnpm size:check` | passed; per-entry emitted graphs measured (Section 6.2) |
| 8 | `pnpm verify:packages` | passed: publint strict, ATTW (9 entrypoints), packed core runtime, TS 7 declarations (bundler/node16/nodenext), minimum-Vue SFC inference + Vite build + SSR render |
| 9 | `pnpm build:apps:prepared` | passed (lab, router-fixture, nuxt-fixture) |
| 10 | `pnpm build:fixtures:prepared && pnpm test:fixtures:prepared` | **12/12 passed** (router authority, Nuxt hydration, JS-disabled route, adaptive sheet, surface preferences) |
| 11 | `playwright test --config playwright.config.ts --project=chromium e2e/sheet.spec.ts e2e/accessibility.spec.ts e2e/coverflow-motion.spec.ts` | **17/17 passed** |
| 12 | `pnpm verify:packages:browser:prepared` | passed: packed Nuxt build, SSR markers, 48 preference cells in chromium/firefox/webkit, focus + composition certification |

Not executed (recorded for completeness): full 8-project browser matrix, preview gate, visual
review suites, release-candidate workflow, physical AT certification.

Limitations: this is a static + test-execution audit on Windows; no macOS/iOS/Android device checks
were possible; no React/Next.js evidence could be produced because none exists in the repository.

---

## 15. Findings register (observation → evidence → impact → severity → action → confidence)

| # | Finding | Evidence | Impact | Severity | Recommended action | Confidence |
|---|---|---|---|---|---|---|
| F1 | React/Next.js support absent | grep: no react package/dep/fixture/docs | half the target market unreachable | Critical | Add `@snap-motion/react` + Next.js fixture (roadmap NOW-1/2) | Certain |
| F2 | Core is genuinely framework-neutral | zero non-relative imports; ES2022 lib; node test env; zero deps | React adapter feasible without core changes | (positive) | Reuse core 1:1 for React adapter | Certain |
| F3 | Media gallery runs a parallel motion stack | no `SnapController` import under `media-gallery/`; own gestures/tween/reduced-motion/messages | divergent behavior, double maintenance, a11y fix leakage | High | Converge onto shared stack or write an ADR justifying otherwise (LATER-11) | Certain |
| F4 | AT certification gate unmet | `docs/release-blockers.md:8-18` | public release blocked | High | Schedule physical certification (NEXT-10) | Certain |
| F5 | Authority protocol duplicated 5× | `CarouselRoot.vue:79-202`, `Coverflow.vue:80-207`, `StackedDeck.vue:103-235`, `Sheet.vue:142-246`, `MediaGalleryDialog.vue:134-401` | contract changes cost 5× | Medium | Extract shared internal module (NOW-3) | Certain |
| F6 | Lab ~19k lines with triplicated editors, duplicated helpers | `PhysicsControls`+`PhysicsField` / `MotionTuning`+`TuningPanel` / `StudioTuneB`; `media-transition.ts` vs `studio-transition.ts` | velocity drag, UX drift | Medium | Consolidate (NOW-6, NEXT-9) | Certain |
| F7 | Two documented flaky tests unresolved | `docs/production-certification.md:185-217` | CI flake risk | Medium | Fix readiness threshold + pile oracle (NOW-5) | High (repo-documented; not re-triggered) |
| F8 | ResizeObserver-loop diagnostics unclassified | `docs/production-certification.md:83-84` | possible perf/correctness issue, unknown | Medium | Investigate classification (LATER) | High (occurrence), Low (harmlessness) |
| F9 | Dead core exports | list in 2.5 (e.g. `resolveCoverflowModularProgress`, `resolveProgrammaticTarget`, unused presets) | public API bloat before first release | Low-Med | Remove now, packages unpublished (NOW-4) | Certain |
| F10 | `motion` dependency used once | only `motion-driver.ts:7` imports it | install weight for all consumers | Low | Consider peer/optional (LATER-14) | Certain |
| F11 | Distribution is verified per-entry | `size:check` emitted graphs + packed consumers passed (Section 6.2) | consumers can import one component | (positive) | Keep the gates; extend to React | Certain |
| F12 | Studio has a distinct, defensible workflow; it forced a real package fix | `docs/motion-studio.md:286-291`, `studio*.spec.ts` | internal research value confirmed | (positive) | Keep internally; cut public narrative chrome (NOW-6) | High |
| F13 | Paged Grid is a demo, not a component | only consumer is `PagedGridDemo.vue:2` | product-brief expectation unmet | Medium | Ship primitive or demote (LATER-12) | Certain |
| F14 | vue/tsc toolchain split (TS 7 vs TS 6 bridge) | `docs/package-contract.md:107-123` | SFC tooling pinned to a bridge | Low | Monitor upstream Vue Language Tools | High |
