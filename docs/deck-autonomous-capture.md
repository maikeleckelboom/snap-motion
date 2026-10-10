# Autonomous Direct pile observation

The original Chromium scenario sampled a running spring's geometry, then asynchronously captured
its raster. These observations could belong to different physical frames. Sparse captures also
sometimes skipped the fold's brief fully occluded interval. The original focused sequence reproduced
an ArrowLeft occlusion failure in one of 32 runs on the integrated polish baseline.

Freezing the controller at 16 ms intervals exposed a separate invalid assertion. An autonomous
source departs along the same clear-body arc as a released source. It legitimately uncovers
under-card material beyond either resting endpoint. The existing release test already recognizes
this distinction. A held horizontal source's endpoint exposure bound cannot certify autonomous
departure. This choreography is unchanged between the original `dev` and approved polish tree.

In the reproduced backward exchange, Team's resting raster envelope was 4,945 pixels, whereas a
sample at physical travel 0.2124 painted 18,415 pixels. Independent continuous polygon occlusion
predicted 18,549.9 square CSS pixels before raster boundary/text exclusions. The additional material
is explained by the actual geometry; it is not a timing tolerance to widen or a motion defect to
hide. Locator scrolling additionally placed an endpoint behind sticky chrome, changing the raster
while its relative poses were identical.

The repaired autonomous capture uses controlled time, centres the complete stage clear of sticky
chrome, and verifies identical poses before and after every screenshot. Every material pixel is
checked against the actual transformed opaque front-card quads: a pixel cell wholly covered by a
front card cannot belong to the card behind it. Fold centre, side ownership, occlusion and final
selection assertions remain. Held scenarios retain their endpoint envelope assertion. Autonomous
scenarios use per-frame physical occlusion instead of an invalid endpoint-area limit. No runtime
Deck choreography, spring duration or tolerance changes.

Raster coordinates use an explicit integer CSS-pixel screenshot clip, its fractional offset from
the stage, and the actual device pixel ratio. WebKit's outward rounding of fractional element clips
otherwise displaced geometry by nearly one CSS pixel. The oracle checks all four pixel-cell corners
through equivalent precomputed half-planes; its independent unit reference tests rotation, DPR 1/2
and fractional origins. Pixel checks run beside browser raster decoding, avoiding transfer of large
material-pixel arrays across the automation protocol without dropping any material pixels.

Raw traces and the independent area calculation remain in `.artifacts/final-integration/`.
