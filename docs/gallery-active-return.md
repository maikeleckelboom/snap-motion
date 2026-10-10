# Gallery return identity and lifecycle

The Lab and public Playground share the native View Transition runner. Closing uses the decoded
media whose slide physically aligns with the carousel's content box, within half a device pixel.
A requested navigation target is not evidence that its image is displayed. A close during an
ambiguous intermediate frame uses ordinary native closure instead of inventing a shared endpoint.

Each media fixture has one stable transition surface and one matching thumbnail surface. The
runner assigns the shared name to the old surface, commits native closure, then removes that name
before assigning it to the matching destination. The original page-root capture remains intact:
excluding it caused missing modal paint and translucent duplicate media in native Chromium.
The transition overlay does not intercept input. New intent skips the prior transition; ownership and
lifecycle generations prevent an old completion from clearing new names or restoring old focus.
Root transition styling is never modified. Expected `ready` rejection after skipping is
observed; an update failure still releases native modality.

Zoom/pan and carousel playback stop at their displayed values before old-state capture. Fitted media
retains the original intrinsic-image transition surface. Zoomed media instead names its clipping
frame, with pan/scale rendered inside it: native capture drops ancestor clips, so naming the scaled
image itself exposed previously cropped pixels across the page. The frame's own clip preserves the
actual visible crop. Both source surfaces still resolve the same stable media identity. Fit reset
happens inside the close commit, after that capture. Reopening starts fitted. Opening decodes its
actual destination before entering the transition callback; the callback commits state and awaits
Vue's DOM publication, without holding the rendering pause for image loading.

Public plates 02 (`long-range`) and 06 (`ember-dunes`) have distinct fixture IDs, Vue keys and
asset URLs, and their SVG contents differ. Their similar warm palette does not make them one media
item. Image URLs or image content do not supply transition identity: only the selected fixture's
mapped DOM surface does. Repeated native opening/closing of 02 and 06 is covered at desktop size and
at mobile size with two fixtures intentionally sharing the same image URL. Each old and new capture has exactly
one named endpoint; the shared name is reused sequentially, never assigned to both items together.

The destination must be connected, visible in layout, enabled, and backed by its actual decoded
image. Partially visible thumbnails are usable without scrolling. For thumbnail-origin opening, a
fully offscreen decoded matching thumbnail is revealed by the smallest vertical adjustment with
an eight-pixel clearance, during native closure and before destination capture. It then receives
focus with `preventScroll`. This is an intentional change in navigation context after browsing to
another item. A general-button opening retains its button and document position; if its matching
thumbnail is offscreen, closure uses the native fallback. Undecoded, failed, hidden and disconnected
endpoints also fall back. Unsupported API and reduced motion use the same native close/focus path.

Visual and focus destinations are independent. A thumbnail-origin A → C close generally focuses C;
a general-button opening generally restores its button, even when C is the visual destination.
Invalid focus targets fall back to a connected visible opener.

`galleryReturn.spec.ts` records both named endpoints, image sources, old zoom transforms and
document offsets. It covers A → A/B/C, C → B, navigation interruption, offscreen/partial thumbnails,
pending/failed images, missing destinations, skip/setup failure, repeated cycles and stale closing
completion after reopening. Real native-API desktop/mobile recordings complement instrumentation
in `.artifacts/final-integration/`. Instrumentation proves endpoint assignment; recordings provide
sampled visual evidence, not universal browser animation proof.

`galleryNativeTransition.spec.ts` additionally freezes native Chromium CSS animations at 140 ms and
samples the real raster for A → A and A → C. It checks the modal canvas during opening and compares
the moving image's opaque colour with its actual thumbnail. Root exclusion passed the endpoint mock
but failed this visual contract. A zero-time native capture also compares the zoomed/panned crop
with its pre-close pixels and ensures it cannot spill onto the surrounding page. This mid-animation
pseudo-element sampling is Chromium coverage;
Firefox's pseudo-element geometry inspection differs. Windows headless WebKit's default software
compositing path crashed native A → A closure on both the approved baseline and updated implementation.
The updated general-button return exposed that same crash in the existing showcase smoke test;
its focused rerun also failed. Sharing the packed consumer's existing Windows compositing launch
options with source projects restores both cases without changing application behavior or disabling
the native API. The close/focus smoke passed ten consecutive times, and real native desktop/mobile
02/06 cycles (including a shared image URL) passed twice each. The instrumented identity and normal/
reduced-motion modal tests still run in all three engines. These headless results do not certify
physical Safari or equivalent mid-animation raster behavior across engines.
