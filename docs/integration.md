# Future maikel.site integration

The first intended production consumer is `maikel.site`, but no application integration is part of
this repository's current work.

The future source-level boundary is:

Snap Motion owns:

- scalar physics and interruption
- semantic carousel and page geometry
- release projection and target policy
- Vue motion, gesture, resize, and reduced-motion primitives

`maikel.site` owns:

- `GalleryLightbox` and `GalleryCarousel` presentation
- project-specific media and captions
- portfolio visual treatment
- routing and project data
- any zoom/pan layer below the carousel track

Integration should consume workspace or source modules without claiming a published npm package.
The application should supply stable media IDs and presentation markup, then render the scalar
position returned by Snap Motion. It must not add CSS transitions, smooth scrolling, native scroll
snap, or another animation library to the same carousel transform.
