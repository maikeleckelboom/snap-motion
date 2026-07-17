# 0002: Measure layout boxes, not visual overflow

Status: accepted

## Decision

Build carousel extent and anchors from viewport and slide-cell layout boxes in one documented
coordinate system. Clamp every raw alignment into legal bounds before it reaches the controller.

## Rationale

`scrollWidth`, overflowing media, transformed descendants, raw offsets, paginator jumps, and later
gap corrections create competing geometry authorities. Oversized images can then enlarge the track
and legal range even though they should occupy one stage.

Explicit cell boxes keep media inside carousel geometry. Variable-width rails remain measurable,
and multiple semantic boundary anchors can retain identity even when they clamp to one physical
position.
