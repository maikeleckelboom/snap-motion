# Reviewed Showcase design decisions

Canonical constraints approved on 2026-10-09 after the Phase 1 UI audit. This concise record carries
the reviewed decisions from the optional, Git-ignored `.artifacts/showcase-ui-audit/` package.
Reviewed corrections take precedence over its earlier proposals and mockups.

- **Showcase:** experience and customize motion. **Workbench:** technical tuning and diagnostics.
  **Fixtures:** certification and deterministic engineering surfaces. Keep all three views.
- `App.vue` owns one shared settings object and the selected base preset. Derive modification,
  applicability and reset state; do not add per-demo copies or a configuration store. Modified and
  Reset cover every shared value, including settings fixed or ignored by the active demo.
- Preserve public motion APIs, spring semantics, geometry, preset values, shared cross-demo settings,
  URL/deep-link behavior, stage-width mechanics, reduced motion, input behavior and focus ownership.
  Choosing a preset replaces earlier manual edits. A shareable tuning URL is outside launch scope.
- M1 stays inside **Advanced physics** in Workbench. Reuse parameter definitions, validation and
  individual fields for future Showcase tuning. Workbench can use compact groups and disclosures.
  Sliders remain exposed to assistive technology with distinct names, keyboard operation and visible
  focus. Exact numeric editing remains available; extra Tab stops are acceptable.
- M2 reserves a compact **Motion Tuning** bar beneath the Showcase stage. Expanded controls appear
  below it without resizing, covering or moving the stage. Persistent rails, floating gesture-surface
  controls and an expanding above-stage toolbar are excluded.
- Before M2/M3, compare stage-first mobile tuning with a compact, discoverable preset selector closer
  to the stage. Decide from actual interaction usability and available stage space. M1 responsive
  Workbench checks do not satisfy this pending Showcase comparison.
- Keep Tight, Balanced, Heavy and Loose with their exact engine values. Balanced stays the lab's
  initial choice; Tight stays the package default. Future preset descriptions need a hands-on feel
  check, defensible perceptual copy and no absolute overshoot claims. Stacked Deck's adjacent-only
  travel is independent of the selected preset.
- Pre-launch polish includes representative Gallery imagery and removal or replacement of
  non-functional public Grid Inspect controls. Retain extreme-media, focus and inert-state
  certification scenarios. These are later milestones, outside M1.

M0 is accepted: Gallery live settings, safe numeric drafts, global preset modification state and
effective fixed skip. Preserve these corrections through M1 (grouped Workbench editor), M2 (Showcase
tuning), M3 (hierarchy/mobile shell) and M4 (visual consistency). No milestone implies release,
Cloudflare deployment or a merge to `main`.
