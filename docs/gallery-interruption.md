# Interruptible gallery navigation

The browser regression reproduced the busy-drop at source
`0d9b16869456d50f3b267c14205b7c9fb3dda32d`: a pointerdown dispatched during
`settling` left pointer mode `idle`. The second gesture never registered.

## Ownership and target policy

The track composable owns one numeric offset and its cancellable animation.
Pointerdown at fit preserves that offset, invalidates the navigation generation,
stops travel, and cancels queued recenter work. Each gesture starts fresh pointer
coordinates and timing. Its displacement is added to the captured offset.

A qualifying release steps from the latest intended destination, even during an
early interruption when the old image still dominates the viewport. Late interruption
uses the same rule. Repeated next gestures therefore advance one destination each.
Reversal steps back from that intended destination and follows the pointer immediately.
An insufficient or cancelled gesture returns to the existing intended destination.
At the first and last items, outward gestures cannot request another item.

Keyed physical slots intersecting the viewport retain their positions through interruption.
Off-screen history is recycled, retaining the presentation owner, mechanical anchor,
destination and immediate navigation neighbors. Retained visibility intervals form one connected
corridor covering the current offset and the entire physical drag and settlement span.
At most eight slots remain mounted, independent of collection size or the number of retargets
before arrival. Off-screen owners receive adjacent physical coordinates instead of retaining
historical semantic spacing. See [physical corridor proof and regression](gallery-corridor.md).
An off-screen target, including a distant mechanical anchor, is placed next to that corridor
in the requested direction, outside its numeric scale/pan bounds. An intersecting zoomed anchor
keeps its physical coordinate. Its keyed node remains intact. Returning to the mechanical anchor
also rebases and releases retained history at actual rest.
Only arrival rebases the destination to position zero. There is no intermediate
rebase reported as settlement. Recenter callbacks are generation guarded, so a
pointerdown at that boundary cancels the previous completion without losing input.

Physical slot coordinates, the mechanical anchor, the intended destination, and
controlled `activeId` remain separate. Visible copy follows the nearest presented
slot with hysteresis. Accessibility retains the mechanical item. Only current,
accepted work emits `settled`. Rejection, redirection, external synchronization,
collection replacement, and close/reopen invalidate obsolete work.

Buttons, keyboard commands, and `navigateTo` use the same intended destination and
cancellation rules. No duration, public option, dependency, or URL input gate is added.
Commands return false for closed, empty, unknown-ID, boundary or already-intended no-ops,
never merely because settlement is active. Intermediate visible copy changes are not settlements.

Exact adoption and structural reconciliation synchronously rebase the track presentation to
the mechanical index. Pointerdown without movement therefore keeps the adopted title,
description and position. Window blur, pointer cancellation and lost capture release gesture
ownership once and restore the existing intended destination. Recovery preserves zoom/pan
transforms and cannot restart work after close, unmount or external invalidation.

## Consumer patch parity

The source also retains image nodes and transforms through closing, preserves
same-ID/same-aspect collections across source and copy changes, rejects stale source
decode work, and supports pointer-centered wheel zoom. These are the remaining
beta.10 consumer patch behaviors. Numeric track presentation already supersedes its
per-frame DOM measurement. The consumer can remove the patch after packaged parity
tests pass.
