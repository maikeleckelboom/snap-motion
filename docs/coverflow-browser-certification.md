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
cell requires both side cards to expose more than 40px. Source WebKit projects now share
the same Windows launch options through `config/browserLaunch.ts`. The software path also
crashed ordinary native Gallery closure on both the approved and updated A → A cases.
Compositing restored both, and the updated general-button close/focus smoke passed ten
consecutive times. The native API, application behavior and assertions remain enabled.
Linux launch options are unchanged.
