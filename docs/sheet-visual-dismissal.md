# Sheet visual dismissal

`openRequest` still reports dismissal intent. The native dialog remains modal through the visible
physical exit. `closed` now reports completed native closure after visual dismissal, which may
precede mathematical spring rest. No props, methods, snap-selection events or package exports change.

The component observes a published closing frame, only near canonical hidden geometry. It compares
the transformed panel's free edge with the native dialog's clipping rectangle on the attached
physical side. At most half a device pixel of panel paint may remain. The paint envelope includes
the border box, outline and outward box shadows (twice the blur radius conservatively bounds their
meaningful tail). Inset shadows do not extend the box. The continuation paints outward towards the
attached edge and is clipped by the dialog. The scrim follows visible primary extent on the same
controller; it has already reached zero when the surface leaves. Consumer filters with unknown
paint reach retain mathematical-rest completion.

At this boundary the existing controller interruption invalidates its animation generation and
clears pointer ownership. Remeasurement while closing establishes the **exact hidden anchor**, zero
velocity and idle mechanics, then the existing native-close/focus lifecycle runs. There is no
passive exit layer, duration timeout or velocity threshold. An underdamped spring cannot bounce back
after its first invisible crossing. Reopening before clearance reverses the existing physical
motion; reopening after clearance starts from canonical hidden state. Old callbacks cannot close a
new lifecycle and `closed` remains once per finalized lifecycle.

Scroll locking remains host-owned. The Playground locks `html` while any Sheet is natively open;
the Lab retains its existing body lock. Gallery's existing modal lock also remains authoritative.
Removing one Sheet's `open` attribute cannot remove another matching modal's lock. No body scroll
container, sticky-header workaround or independent lock manager has been added. The stable root
scrollbar gutter and native focus return preserve document position.

Manual-driver tests exercise a dense subpixel boundary, high velocity, exact cleanup and stale
completion after reopening. Browser tests sample actual transformed bounds on all four sides with
slow, strongly underdamped and Balanced springs, and verify native modal ownership and immediate
background interaction. Public desktop/mobile checks retain header position, gutter and document
scroll offsets. Existing Sheet suites retain reduced motion, dismissal paths, scrolling, focus and
interruption coverage. Ignored recordings and raw samples are in `.artifacts/final-integration/`.
