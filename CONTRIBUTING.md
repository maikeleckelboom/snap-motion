# Contributing

Snap Motion is currently developed in a private repository. Discuss architecture or public-contract
changes before implementation. Keep the framework-neutral controller independent from Vue and the
DOM, preserve semantic IDs, and do not add animation libraries or production dependencies without a
measured need.

Use Node and pnpm versions pinned by the repository, then run:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

## Development runs from source

`pnpm dev` starts the lab Vite server and nothing else. In serve mode the lab resolves every public
`@snap-motion/core` and `@snap-motion/vue` entrypoint to its workspace source module, so edits under
`packages/*/src` reach the module graph immediately and no package `dist` is required to work on the
repository. `playwright.config.ts` starts the same server, so normal E2E is source-native too.

`config/source-entrypoints.ts` owns that map and is shared with `vitest.config.ts`. It is a
deliberate entrypoint map, not a wildcard: only specifiers a package actually exports appear in it,
so a source alias can never expose a private module that the published package would reject.

The aliases apply to `command === "serve"` only. `pnpm build`, `pnpm test:preview`,
`pnpm test:fixtures`, `pnpm verify:packages`, and `pnpm pack:packages` keep resolving through
`node_modules`, so release validation always exercises the real distributable artifacts.

API Extractor stays in build, release, and API certification — it owns the `.d.ts` rollups, the
checked API reports in `etc/`, and public-surface drift detection. It never runs during `pnpm dev`.
It deliberately analyses with its own bundled TypeScript rather than the workspace compiler;
`scripts/run-api-extractor.mjs` routes that preamble through API Extractor's supported
`messageCallback` hook so the runner states it once instead of once per entrypoint, and every real
extractor, compiler, TSDoc, and API-report diagnostic keeps its normal reporting.

Changes to a publishable package need a Changeset unless they are documentation-only. Public API
changes must include the reviewed API report diff. Browser-visible changes require Chromium,
Firefox, and WebKit evidence. Never claim physical assistive-technology certification from automated
tests.
