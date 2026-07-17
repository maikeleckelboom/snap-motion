# Keyboard and ownership

`CarouselRoot` defaults to `keyboardNavigation=true` and `keyboardScope="auto"`.

- `auto`: dialog-wide Left/Right when exactly one relevant carousel is in an open native dialog;
  otherwise carousel-root scope.
- `carousel`: only events originating inside the carousel root.
- `dialog`: nearest containing dialog, with safe carousel fallback.
- `off`: no automatic listener; controls and imperative methods still work.

`keyboardNavigation=false` is equivalent to `keyboardScope="off"`. Set `keyboardPrimary` (or the
equivalent data marker) when a dialog deliberately contains multiple carousels. Without a unique
primary, focus must be inside one carousel and development builds warn about ambiguous ownership.

Left and Right Arrow are physical keys mapped to logical previous/next for the resolved direction.
Home and End remain local to the carousel surface. A handled key interrupts the current spring,
keeps focus where it is, and prevents default only when navigation actually occurs.

## Ownership markers

Snap Motion automatically leaves Arrow keys to form controls, editable content, media controls,
composite widgets, and interactive descendants inside slides.

```html
<div data-snap-motion-keyboard-owner>Own Left and Right Arrow here</div>
<div data-snap-motion-ignore-drag>Never begin a Snap Motion drag here</div>
<div data-snap-motion-wheel-owner>Retain wheel gestures here</div>
<CarouselRoot data-snap-motion-primary-carousel>...</CarouselRoot>
```

To let an otherwise ordinary descendant hand Arrow keys back to the carousel:

```html
<div tabindex="0" data-snap-motion-keyboard-navigation>Arrow keys navigate the carousel</div>
```

Nested roots arbitrate by nearest `data-snap-motion-carousel-root`; a bubbling event cannot move
both the inner and outer carousel.
