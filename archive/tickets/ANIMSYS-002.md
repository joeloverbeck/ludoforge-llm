# ANIMSYS-002: Pure EffectTrace -> AnimationDescriptor Mapping

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-001

## Problem

Spec 40’s testability depends on a pure descriptor layer that maps `EffectTraceEntry[]` into `AnimationDescriptor[]` without GSAP/PixiJS coupling. This is the canonical translation boundary for detail-level filtering and preset selection.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/trace-to-descriptors.ts` does not exist yet; mapping logic is currently missing.
2. `packages/runner/src/animation/animation-types.ts` already exists from ANIMSYS-001 and already aligns with canonical kernel trace field names (`from`, `to`, `zone`, `type`, etc.), so this ticket should not rename/alias fields.
3. The current `GameStore` tests are not the primary validation surface for descriptor mapping; this ticket should be validated primarily by dedicated animation mapping unit tests, with store tests treated as optional regression coverage only if behavior overlap appears.
4. The architecture benefit is high: introducing this pure mapping boundary is cleaner and more extensible than embedding trace interpretation in GSAP/timeline/controller code. It centralizes transformation rules, keeps detail-level policy deterministic, and preserves game-agnostic engine boundaries.

## File List (Expected)

- `packages/runner/src/animation/trace-to-descriptors.ts` (new)
- `packages/runner/src/animation/index.ts` (update export)
- `packages/runner/test/animation/trace-to-descriptors.test.ts` (new)

## Implementation Notes

- Implement `traceToDescriptors(trace, options)` exactly as Spec 40 D2.
- Cover mapping for: `moveToken`, `createToken`, `destroyToken`, `setTokenProp`, `varChange`, `resourceTransfer`, `lifecycleEvent`, `forEach`, `reduce`.
- Map `provenance.eventContext === 'triggerEffect'` to `isTriggered: true`.
- Implement detail-level filtering rules:
  - `full`: all mapped descriptors, including structural `SkippedDescriptor` entries.
  - `standard`: omit triggered `VarChangeDescriptor` and `PhaseTransitionDescriptor`.
  - `minimal`: only move/create descriptors, while preserving structural `SkippedDescriptor` entries.
- Keep skipped structural entries as `SkippedDescriptor` in pure output.

## Out of Scope

- No GSAP timeline creation.
- No sprite/container lookup.
- No queueing/playback concerns.
- No reduced-motion behavior.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/trace-to-descriptors.test.ts`
2. `packages/runner/test/animation/animation-types.test.ts`
3. `packages/runner/test/store/game-store.test.ts` (regression-only, no assertion changes expected)
4. `packages/runner/test/store/game-store-async-serialization.test.ts` (regression-only, no assertion changes expected)

### Invariants That Must Remain True

1. `traceToDescriptors` is pure and deterministic for identical inputs.
2. Structural trace entries (`forEach`, `reduce`) never produce visual tween descriptors.
3. Non-`phaseEnter` lifecycle events do not map to visual phase descriptors.
4. No game-specific branching appears in descriptor mapping code.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added pure descriptor mapping at `packages/runner/src/animation/trace-to-descriptors.ts`.
  - Exported mapper from `packages/runner/src/animation/index.ts`.
  - Added coverage at `packages/runner/test/animation/trace-to-descriptors.test.ts`.
  - Updated this ticket assumptions/scope to match current repo state and spec-aligned architecture boundaries.
- **Deviations from original plan**:
  - Store tests were kept as regression verification only; no fixture drift required updates.
  - Detail filtering keeps structural `SkippedDescriptor` entries in output to preserve trace/debug fidelity while still filtering visual descriptors.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/trace-to-descriptors.test.ts test/animation/animation-types.test.ts test/store/game-store.test.ts test/store/game-store-async-serialization.test.ts` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
