# 0005: Normalize modal sheets onto one closing scalar

Status: accepted.

## Decision

Expose one modal `Sheet` component with the physical `side` values `top`, `right`, `bottom`, and
`left`. Keep responsive inline supporting panes as host-owned composition, never as an adaptive
mode inside the package component.

Each side has a central descriptor:

| Side     | Axis | Transform sign | Outward closing drag | Handle edge |
| -------- | ---- | -------------: | -------------------- | ----------- |
| `bottom` | `y`  |           `+1` | down                 | top         |
| `top`    | `y`  |           `-1` | up                   | bottom      |
| `right`  | `x`  |           `+1` | right                | left        |
| `left`   | `x`  |           `-1` | left                 | right       |

The internal scalar always increases toward closed. The hidden anchor is internal and larger than
every open anchor. Pointer delta and velocity are normalized at the DOM adapter boundary; release
selection and scrim progress therefore have one implementation for all sides.

Consumer snap points resolve visible primary-axis extent. Top and bottom default to `full`,
`comfortable`, and `compact`. Left and right default to one `open` point on a bounded fixed-width
surface; a custom partial point translates that surface rather than changing its inline size.

## Rendering and semantics

`Sheet` remains a native modal `<dialog>` using `showModal()`. Its handle occupies only the inner
movable edge and its body remains a native vertical scrollport. Transform continuation surfaces
cover open-edge elasticity without entering intrinsic measurements. Top and bottom surfaces are
full bleed while title, picker, and body share one optional centered content measure. Safe areas
map independently to all four physical edges, including in RTL.

Changing `side` interrupts movement, retains a still-valid semantic snap ID, remeasures the new
axis, and atomically places the new transform. Fallback is the new side's default point, then the
first configured point. Presentation swaps use a focused internal close path that skips the exit
spring and focus return to an unmounting compact trigger; the host owns focus transfer into its
inline pane.

## Consequences

The unpublished bottom-specific entrypoint and symbols are removed rather than aliased. Package
users import `@snap-motion/vue/sheet`. The package owns no breakpoint and never changes the native
dialog into an `aside`.
