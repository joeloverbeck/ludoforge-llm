# ANIMSYS-003: Preset Registry + Built-in Presets

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-001, ANIMSYS-002

## Problem

Timeline construction needs a registry that resolves descriptor kinds to reusable, named tween presets. Without a registry boundary, animation behavior becomes hardcoded and non-extensible for Spec 42 runtime overrides.

## File List (Expected)

- `packages/runner/src/animation/preset-registry.ts` (new)
- `packages/runner/src/animation/animation-types.ts` (update)
- `packages/runner/test/animation/preset-registry.test.ts` (new)

## Implementation Notes

- Implement a typed `PresetRegistry` with registration and lookup APIs.
- Ship built-in preset IDs from Spec 40 D3: `arc-tween`, `fade-in-scale`, `fade-out-scale`, `tint-flash`, `counter-roll`, `banner-slide`, `pulse`.
- Include default duration metadata and descriptor-kind compatibility checks.
- Keep registry runtime-agnostic except for GSAP tween factory signatures.

## Out of Scope

- No trace subscription/controller logic.
- No store mutations.
- No UI controls.
- No visual-config YAML loader implementation.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/preset-registry.test.ts`
2. `packages/runner/test/animation/animation-types.test.ts`
3. `packages/runner/test/canvas/GameCanvas.test.ts` (regression)

### Invariants That Must Remain True

1. Preset IDs are stable string keys and game-agnostic.
2. Missing preset lookup surfaces recoverable errors (no process crash).
3. Registry can be extended at runtime without mutating built-in definitions.
4. Triggered-effect visual distinction remains representable via `pulse` prepend behavior.
