# Package contract

Both release-candidate packages remain private and unpublished. Names must not be treated as owned
until npm ownership is manually verified.

## Entry points

- `@snap-motion/core`
- `@snap-motion/vue`
- `@snap-motion/vue/components`
- `@snap-motion/vue/composables`
- `@snap-motion/vue/style.css`

Core is ESM-only and has zero runtime dependencies. Vue is a peer dependency (`>=3.5.0 <4`) and is
certified against 3.5.0 and the current workspace version. VueUse and Motion remain internal runtime
dependencies; their implementation-specific playback types are not public.

Node 24 and the pinned pnpm version are maintainer-tool requirements, not copied into package
consumer manifests. Consumers must use an ESM-capable runtime or bundler.

`pnpm verify:packages` builds actual tarballs, inspects their contents, rejects workspace protocols,
runs strict Publint and ATTW checks, then installs the artifacts outside the monorepo. Clean fixtures
compile bundler, Node16, and NodeNext modes and exercise ESM, Vite, Vue Router, SSR, Nuxt hydration,
CSS, and browser behavior.

Tracked reports in `etc/core.api.md` and `etc/vue.api.md` freeze the reviewable TypeScript surface.
API changes require an intentional report update and a Changeset.
