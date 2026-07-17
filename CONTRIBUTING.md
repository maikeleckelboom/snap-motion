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

Changes to a publishable package need a Changeset unless they are documentation-only. Public API
changes must include the reviewed API report diff. Browser-visible changes require Chromium,
Firefox, and WebKit evidence. Never claim physical assistive-technology certification from automated
tests.
