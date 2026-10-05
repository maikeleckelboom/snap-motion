# Coverflow browser certification

The packed surface preference checks keep accelerated compositing enabled for Windows
WebKit. Playwright disables it by default on Windows, and that software path flattens
Coverflow's shared perspective camera. Headless operation remains enabled.

This was reproduced independently with the unchanged Coverflow CSS from
`0d9b16869456d50f3b267c14205b7c9fb3dda32d`. At a 1120px stage, 672px cards and
1440px perspective, a side card exposed 0.41px with the default Windows WebKit launch.
Removing only `--disable-accelerated-compositing` restored 196.48px, matching Chromium.
No Coverflow source, camera, dimensions, or geometry assertions were changed.

The existing packed preference matrix remains the regression: every wide full-motion
cell requires both side cards to expose more than 40px. This launch correction is
limited to that packed surface certification and is independent of gallery navigation.
