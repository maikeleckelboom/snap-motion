# 0003: Build a standalone repository

Status: accepted

## Decision

Develop Snap Motion as a private standalone pnpm workspace with a framework-neutral core, thin Vue
adapter, regression lab, frozen donors, tests, and documentation.

## Rationale

Inventing the system inside `maikel.site` would entangle reusable physics and geometry with portfolio
presentation, data, and captions. A standalone repository makes the controller and geometry testable,
preserves provenance, and provides a serious tuning surface before production integration.

This boundary does not imply a public package. All packages are private and the future application
integration remains source-level work.
