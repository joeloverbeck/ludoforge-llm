# ANIMSYS-002: Pure EffectTrace -> AnimationDescriptor Mapping

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-001

## Problem

Spec 40’s testability depends on a pure descriptor layer that maps `EffectTraceEntry[]` into `AnimationDescriptor[]` without GSAP/PixiJS coupling. This is the canonical translation boundary for detail-level filtering and preset selection.

## File List (Expected)

- `packages/runner/src/animation/trace-to-descriptors.ts` (new)
- `packages/runner/src/animation/animation-types.ts` (update)
- `packages/runner/test/animation/trace-to-descriptors.test.ts` (new)
- `packages/runner/test/store/game-store.test.ts` (regression-only updates if needed for fixture drift)

## Implementation Notes

- Implement `traceToDescriptors(trace, options)` exactly as Spec 40 D2.
- Cover mapping for: `moveToken`, `createToken`, `destroyToken`, `setTokenProp`, `varChange`, `resourceTransfer`, `lifecycleEvent`, `forEach`, `reduce`.
- Map `provenance.eventContext === 'triggerEffect'` to `isTriggered: true`.
- Implement detail-level filtering rules:
  - `full`: all non-skipped descriptors.
  - `standard`: omit triggered `VarChangeDescriptor` and `PhaseTransitionDescriptor`.
  - `minimal`: only move/create descriptors.
- Keep skipped structural entries as `SkippedDescriptor` in pure output.

## Out of Scope

- No GSAP timeline creation.
- No sprite/container lookup.
- No queueing/playback concerns.
- No reduced-motion behavior.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/trace-to-descriptors.test.ts`
2. `packages/runner/test/store/game-store.test.ts`
3. `packages/runner/test/store/game-store-async-serialization.test.ts` (regression: effect trace state handling unchanged)

### Invariants That Must Remain True

1. `traceToDescriptors` is pure and deterministic for identical inputs.
2. Structural trace entries (`forEach`, `reduce`) never produce visual tween descriptors.
3. Non-`phaseEnter` lifecycle events do not map to visual phase descriptors.
4. No game-specific branching appears in descriptor mapping code.
