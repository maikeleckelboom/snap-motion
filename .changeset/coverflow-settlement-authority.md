---
"@snap-motion/vue": patch
---

Fix a controlled Coverflow that snapped instead of travelling, and lost its `settled` event, when
the host moved its authority in the same turn as a settlement. A rail checks each settlement against
the host's authority one microtask after reporting it. A host that reacted to the rail's rest, or to
the request that caused it, by asking for another destination changed the authority before that
check ran. The stale settlement was then rolled back to the new authority, which teleported the rail
there, and the `settled` event for the destination the host actually chose was swallowed.

Coverflow now discards a queued settlement when the host redirects its authority elsewhere, and
reports only its latest settlement, exactly as StackedDeck already did. A settlement that a newer one
supersedes before the check is no longer reported. A host that simply confirms the destination, or
ignores a request, behaves as before.
