# Playground preview deployment

The first Cloudflare Pages preview should serve the existing two-entry Vite build: the Playground
at `/playground/` and the engineering Lab at `/`. Keep the public entry, shared assets and Lab links
together by uploading the complete Lab output directory. The reusable packages stay private and
unpublished; hosting this static application does not require npm publication.

## Build configuration

Use a Git-connected Pages project with these proposed settings. They are preparation instructions,
not evidence that a Cloudflare project has been created or deployed.

| Setting                 | Value                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Repository              | `maikeleckelboom/snap-motion`                                                                              |
| Root directory          | Repository root                                                                                            |
| Framework preset        | None                                                                                                       |
| Production branch       | `main`; disable automatic production deployments until the preview is accepted                             |
| Preview branch          | Include `dev`                                                                                              |
| Build output directory  | `apps/lab/dist`                                                                                            |
| Node version            | `24.16.0`, matching `.node-version`                                                                        |
| Dependency installation | Disable automatic installation with `SKIP_DEPENDENCY_INSTALL=1`; the build command owns the frozen install |
| Build command           | `pnpm install --frozen-lockfile && pnpm build:packages && pnpm --filter @snap-motion/lab build`            |

The repository pins `pnpm@11.13.1` through `packageManager`; check both tool versions in the build log.
Set `PNPM_VERSION=11.13.1` in the Preview environment as well as `NODE_VERSION=24.16.0`. No application secrets, Functions, backend
or deployment dependency are needed. Creating the project requires the owner's Cloudflare account
and repository-access decision.

Use the root-base `build` command above for Pages. `pnpm build:preview` deliberately emits a
`/snap-motion/` base for the existing portability test and is not this host's deployment artifact.
The Playground remains at `/playground/`; serving only `dist/playground` would break its shared asset
and Lab paths. Pages handles directory index routes; verify its real redirect for `/playground`
after deployment rather than adding a blanket SPA rewrite.

## Local preparation

With the pinned tools and frozen dependencies installed:

```sh
pnpm build:packages
pnpm --filter @snap-motion/lab build
pnpm --filter @snap-motion/lab exec vite preview --host 127.0.0.1 --port 4176 --strictPort
```

Open `http://127.0.0.1:4176/playground/` for the built public application. The repository's final
`pnpm verify` also checks the separate non-root-base build and packed package consumers.

## Interaction acceptance

Review these at desktop and narrow widths with full motion enabled. Automation and browser
emulation support this review; the owner's judgment and a physical mobile browser remain separate
acceptance evidence.

- **Sheet:** customize stiffness to 50, damping to 28, mass to 4, control impulse to 0, rest speed to
  0.1 and rest distance to 0.01. Open and close on each physical side. Check that the modal releases
  when the visible Sheet leaves, preserves the page's scroll position and header, restores focus,
  and can immediately reopen.
- **Gallery:** open plate A, navigate through B to C, then close. Check that the visible C returns
  to C's thumbnail and focus follows it. Repeat during navigation, with zoom/pan, and on a narrow
  viewport where C's thumbnail is offscreen. Judge whether the minimal thumbnail reveal feels
  natural; an ambiguous in-flight image should close without an incorrect return animation.
- **Coverflow:** move 4 → 5 → 4, interrupt the movement and hold an elastic drag beyond the end.
  Check the five-card rail stays painted and a held surface does not jump during remeasurement.

## Hosted preview evidence

After the owner's interaction review, create the preview and record its exact Git source, build
log, deployment URL and review results. Check `/playground`, `/playground/`, section deep links,
the Engineering Lab link and a Sheet Workbench link. Decode all screens and Gallery plates, open
and close both modals, change a shared preset, and inspect runtime errors and failed asset requests.
Repeat the interaction acceptance on the hosted build and test touch, scrolling and modal focus on
a physical mobile browser. Local preview success is not hosted or physical-device proof.

Keep the README's local Explore link until a stable public Playground URL works. Promotion to
`main`, production deployment and the portfolio link follow accepted preview evidence. VitePress
and performance optimization remain separate work; new measurements should precede optimization.

Cloudflare references, checked on 2026-10-10:

- [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Build image and version overrides](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Serving directory index pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
