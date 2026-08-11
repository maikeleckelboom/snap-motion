# Package contract

Both release-candidate packages remain private and unpublished. Names must not be treated as owned
until npm ownership is manually verified.

## Entry points

- `@snap-motion/core`
- `@snap-motion/vue`
- `@snap-motion/vue/carousel`
- `@snap-motion/vue/coverflow`
- `@snap-motion/vue/stacked-deck`
- `@snap-motion/vue/sheet`
- `@snap-motion/vue/dialog`
- `@snap-motion/vue/media-gallery`
- `@snap-motion/vue/motion`
- `@snap-motion/vue/localization`
- `@snap-motion/vue/style.css`

Core intentionally keeps one root entrypoint: its framework-neutral geometry, physics, state
models, controller, presentation, selection, and tuning primitives all have plausible adapter or
custom-renderer consumers and tree-shake without runtime dependencies. Capability subpaths would
add ownership and semver complexity without splitting a runtime graph.

The Vue root is a curated common path: high-level components, common contracts/localization, and
ordinary carousel composition primitives. Capability-specific composables, geometry, tuning, and
Media Gallery remain on their explicit subpaths. Capability subpaths make feature ownership explicit
and allow consumers to depend on a narrower surface. The former implementation-form subpaths
`components` and `composables` are intentionally absent. No wildcard or package-internal deep import
is supported.

Core is ESM-only and has zero runtime dependencies. Vue is a peer dependency (`>=3.5.0 <4`) and is
certified against 3.5.0 and the current workspace version. VueUse and Motion remain package runtime
dependencies; their implementation-specific playback types are not public.

Node 24 and the pinned pnpm version are maintainer-tool requirements, not copied into package
consumer manifests. Consumers must use an ESM-capable runtime or bundler.

## Declarations

Source uses extensionless relative specifiers between TypeScript modules. `tsc` and `vue-tsc` emit
an intermediate declaration graph under `temp/declarations`; API Extractor then rolls each public
entrypoint into one self-contained declaration file in `dist`. Intermediate modules, declaration
maps, Vue SFC compatibility aliases, and relative declaration edges do not ship.

`pnpm verify:packages` builds actual tarballs, parses them without a system `tar` dependency,
inspects their contents, rejects workspace protocols, checks every export-map target, rejects
relative declaration edges and source-only aliases, and runs strict Publint plus ATTW across the
supported ESM resolutions. The legacy Node10 self-subpath probe is explicitly excluded while clean
Bundler, Node16, and NodeNext consumers remain hard failures. The verifier also asserts the packed
Vue-to-core dependency is the caret range derived from the packed core version. One clean fixture
depends directly on core. The ordinary minimum/current Vue fixtures depend directly
on **only** `@snap-motion/vue`; a workspace override points its transitive core dependency at the
packed core artifact as test infrastructure. Installs disable lifecycle scripts. Clean fixtures
compile bundler, Node16, and NodeNext modes and exercise ESM, every Vue surface, Vite, Vue Router,
SSR, Nuxt build/generate/hydration without `ClientOnly`, CSS, and browser behavior.

The browser proof changes inherited direction at runtime and checks root/content direction while
the transform track remains LTR, then exercises keyboard, pointer, wheel, and the real click a drag
would otherwise produce. The generated chunk graph fails when a capability entrypoint pulls an
unrelated high-level feature; media-gallery isolation remains a dedicated hard assertion.
`config/size-budgets.json` is the sole authority for current raw and gzip limits. Budget changes
require evidence from the emitted graph and an explanation tied to consumer value; documentation
does not duplicate volatile numeric thresholds.

Those fixtures also run `vue-tsc` over single-file components that use the generic surface
components the way an application does: no explicit generic arguments, no casts, readonly `as const`
items and ordinary mutable arrays, `v-model:active-id`, `itemLabel` inference, `#card` slot state,
and handle typing — plus companion uses that must be **rejected**. `tsc` cannot see inside an SFC
and a Vite build erases types, so neither can tell whether template inference still resolves the
consumer's own item type and semantic ID union from `items` alone. Only the SFC type-check can.
Media Gallery is included in both readonly and mutable forms, and its props, `v-model`, events, and
handle must retain the exact item ID union. Every packed consumer uses `skipLibCheck: false`.

Tracked reports in `etc/*.api.md` freeze every public entrypoint's TypeScript surface. API changes
require an intentional report update and a Changeset.

## TypeScript policy

Repository-owned `.ts` code and core declarations are maintained with TypeScript 7.0.2. TypeScript
7 deliberately no longer exposes the programmatic compiler API used by Vue SFC tooling. Vue
Language Tools 3.3.9 supports the transition by running SFC declaration and template checks through
the official `@typescript/typescript6` compatibility package; the resolved compiler is TypeScript
6.0.2. This is an upstream boundary, not a pin of the whole workspace to TypeScript 6.

Packed declaration consumers cover current TypeScript 7 for ordinary `.ts` entrypoints and the
TypeScript 6 bridge for actual Vue SFC template inference. Vue Language Tools cannot currently run
its programmatic SFC pipeline on TypeScript 7 because that compiler API was removed; the official
TypeScript 6 bridge is therefore the strongest real SFC check, while TypeScript 7 still checks every
ordinary declaration entrypoint under bundler, Node16, and NodeNext resolution. TypeScript is
neither a runtime nor peer dependency. API Extractor 7.58.12 continues to use its own analysis engine
after deterministic declaration emission; the maintainer compiler and extractor engine are
intentionally distinct. Packed-consumer compiler versions are read from the root workspace
configuration, so fixture templates cannot drift.
