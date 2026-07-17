# Physics

Positions are CSS pixels. Velocities are CSS pixels per second. Projection duration is seconds.
Those units are explicit at every public boundary.

## Velocity

The velocity tracker stores a bounded recent sample window and ignores non-finite values and
duplicate or reversed timestamps. A recency-weighted estimate uses more than the final event pair,
so bursty input and a stationary pointer-up do not erase the gesture that preceded them. The tracker
can be reset and reused.

## Projection and target selection

Projection computes a candidate physical destination separately from semantic target selection:

```text
projectedPosition = position + velocity * projectionSeconds
```

A slow release resolves the nearest appropriate semantic anchor with deterministic ties. A decisive
fling uses direction and projection but is capped by the configured maximum logical anchor skip.
The carousel default permits at most two anchors. Start and end never loop.

## Springs

Settling uses a physical spring configured by stiffness, damping, mass, rest speed, and rest
distance. The actual release or retarget velocity enters the spring. Buttons and keyboard actions
use the same controller and spring family, with a controlled directional impulse rather than a
separate timing function.

## Elasticity

Outside a legal edge, rendered overdrag follows an asymptotic resistance curve:

```text
elasticDistance = limit * overdrag / (overdrag + limit * resistance)
```

Resistance is a dimensionless value greater than or equal to one. The curve is continuous at the
boundary, never exceeds its configured visual limit, and can be configured independently for the
minimum and maximum edges. Elastic positions are temporary render values; settle targets are always
legal anchors.

## Presets

- **Tight** — default; compact, fast, firm, and minimally oscillatory
- **Balanced** — a slightly broader general-purpose response
- **Heavy** — more mass and deliberate programmatic impulse
- **Loose** — the most elastic tuning hypothesis, still bounded and decisive

Each preset coherently changes spring, projection, fling threshold, skip cap, elasticity, and
programmatic impulse. Presets are starting hypotheses intended for comparison in the lab.

## Interruption and resize

Interruption stops playback at the current rendered scalar. Resize while settling restarts toward
the same semantic ID using that rendered position and velocity. Reduced motion completes the target
without discarding callbacks or semantic state.
