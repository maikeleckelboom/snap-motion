# Interaction contract

## Interruption

A drag, button, keyboard, or supported wheel action stops the active spring immediately and begins
from the latest rendered position and velocity. There are no animation queues. Stale update or
completion callbacks cannot regain ownership after interruption.

## Pointer and touch

Only the primary pointer participates. Mouse input requires the left button. The owning surface
uses pointer capture, handles cancellation and lost capture, releases capture safely, and removes
every listener on completion or unmount.

Movement is one-to-one inside legal bounds and passes through nonlinear resistance outside them.
Selection suppression exists only during an active drag. Images disable native drag.

An inline horizontal carousel does not claim touch immediately. After a small threshold, horizontal
displacement must clearly dominate vertical displacement before the rail owns the gesture. A
vertical decision remains page scrolling. The bottom-sheet handle is an explicit vertical drag
surface and may claim directly.

## Wheel

Wheel deltas are normalized from pixel, line, and page modes. Genuine horizontal input is accepted;
Shift plus vertical wheel may be treated as horizontal intent. Ordinary vertical scrolling is not
prevented. A handled wheel burst directly updates the scalar and settles after a short quiet period.
There is no arbitrary multiplier and wheel is not treated as a touch fling.

## Keyboard

Carousels support ArrowLeft, ArrowRight, Home, and End. A paged grid moves by semantic page unless a
focused child control owns the key. Tab remains normal focus traversal and is never pagination.
Non-looping boundaries disable previous or next actions.

When activating a control reaches a boundary, applying `disabled` immediately makes Chromium drop
focus. Snap Motion therefore defers native `disabled` only while that now-boundary control still
owns focus, exposes `aria-disabled="true"`, and makes activation a no-op. Native `disabled` is applied
on blur. This preserves repeated-control focus without leaving ordinary boundary controls tabbable.

Native modal dialog traversal remains authoritative. Cross-browser certification exposed one
Chromium edge where Tab from the final control transiently moved focus to the inert document. The
dialog helpers intercept only first/last Tab boundaries; all intermediate traversal stays native.

## Accessibility and focus

Carousel regions use stable accessible names and `aria-roledescription="carousel"` where it adds
meaning. Item position/count and restrained live status are exposed for explicit navigation. Icons
are real SVG markup with named controls.

The media lightbox and bottom sheet use native modal dialogs. Escape uses the dialog cancellation
path. Both provide an explicit close button, move focus inside after opening, restore the connected
opener on close, and clean modal document state on unmount. The bottom sheet keeps a dedicated drag
handle and an independently scrollable body with safe-area padding.

Initial focus is explicit: close button, title/static introduction, first interactive element, or a
provided element/resolver. Focus restoration accepts both an opener and a route-safe fallback.
Bottom-sheet scrims are non-focusable pointer surfaces. Meaningful sheet snaps are also exposed as a
native single-choice radio group.

## Reduced motion

Reduced motion preserves direct manipulation and every navigation path. It removes inertial travel
and prolonged settling by resolving the selected semantic target immediately or nearly immediately.
It does not disable dragging. A preference change during settling interrupts the spring and completes
the same target deterministically.
