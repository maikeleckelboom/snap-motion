# Release blockers

Automated release-candidate assembly is ready, but public publication is blocked.

The media-gallery harness and dossier are `Prepared for manual assistive-technology certification`.
Preparation does not change any physical result below.

| Blocker                                      | Status       |
| -------------------------------------------- | ------------ |
| npm name ownership for core and Vue          | Unverified   |
| NVDA + Firefox physical certification        | Not executed |
| NVDA + Chrome/Edge physical certification    | Not executed |
| VoiceOver + Safari macOS certification       | Not executed |
| VoiceOver + Safari iPhone certification      | Not executed |
| TalkBack + Chrome Android certification      | Not executed |
| Windows forced-colors physical review        | Not executed |
| Text-only zoom and physical 200%/400% review | Not executed |
| Manual publication approval                  | Not granted  |

The repository is publicly visible and its package manifests point to it; this was verified through
GitHub on 2026-08-08 and is no longer a blocker. Both npm registry lookups returned `404` on the same
date. That proves no public version was found, not that the current account owns the scope or names,
so ownership remains unverified.

Packages remain private and unpublished. These blockers also mean downstream maikel.site
integration is not unblocked.
