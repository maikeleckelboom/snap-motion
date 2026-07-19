# Package contract

Both release-candidate packages remain private and unpublished. Names must not be treated as owned
until npm ownership is manually verified.

## Entry points

- `@snap-motion/core`
- `@snap-motion/vue`
- `@snap-motion/vue/carousel`
- `@snap-motion/vue/bottom-sheet`
- `@snap-motion/vue/dialog`
- `@snap-motion/vue/motion`
- `@snap-motion/vue/localization`
- `@snap-motion/vue/style.css`

The Vue root re-exports the common stable API. Capability subpaths make feature ownership explicit
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

`pnpm verify:packages` builds actual tarballs, inspects their contents, rejects workspace protocols,
checks every export-map target, rejects relative declaration edges and source-only aliases, and runs
strict Publint and ATTW checks. Clean fixtures compile bundler, Node16, and NodeNext modes and
exercise ESM, Vite, Vue Router, SSR, Nuxt hydration, CSS, and browser behavior.

Tracked reports in `etc/*.api.md` freeze every public entrypoint's TypeScript surface. API changes
require an intentional report update and a Changeset.
