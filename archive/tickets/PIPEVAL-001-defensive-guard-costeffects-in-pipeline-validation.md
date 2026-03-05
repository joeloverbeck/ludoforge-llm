# PIPEVAL-001: Add defensive guard on costEffects in pipeline validation

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None (standalone hardening)

## Problem

`validateActionPipelines` calls `actionPipeline.costEffects.forEach(...)` without a defensive `?? []` guard. The `ActionPipelineDef` type declares `costEffects` as required (`readonly costEffects: readonly EffectAST[]`), so well-formed GameDefs always have it. However, the validator's job is to handle malformed input gracefully — crashing on `undefined.forEach` is not graceful. The adjacent `stage.effects` field already has a `?? []` guard for exactly this reason.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.costEffects` is typed as required — confirmed at `types-operations.ts:31`.
2. Existing tests currently provide `costEffects` in malformed `as unknown as GameDef` fixtures; there is no explicit regression test for missing `costEffects`.
3. `validateGameDef` is called directly in unit/integration tests and runtime boundaries, so schema parsing is not the only malformed-input gate.
4. `stage.effects ?? []` already follows the defensive-validation pattern used for partial/incomplete payloads; `costEffects` should align with that model.

## Architecture Check

1. Validators should never crash on malformed input — they should diagnose it. Defensive guards are the established pattern (see `stage.effects ?? []`, `def.actionPipelines?.forEach`, `def.terminal?.checkpoints`).
2. No game-specific logic involved — this is purely engine-level validation robustness.
3. This improves architecture quality by keeping validators total (non-throwing) over malformed structural input, preserving deterministic diagnostic behavior.
4. No backwards-compatibility shims — just a nullish coalescing guard and regression coverage.

## What to Change

### 1. Guard `costEffects` in `validateActionPipelines`

In `validate-gamedef-extensions.ts`, change:
```typescript
actionPipeline.costEffects.forEach((effect, effectIndex) => {
```
to:
```typescript
(actionPipeline.costEffects ?? []).forEach((effect, effectIndex) => {
```

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)

## Out of Scope

- Adding structural diagnostics for missing `costEffects` (this ticket only prevents validator crashes; structural required-field diagnostics are a separate policy decision)
- Other nullable field guards (already handled or not applicable)

## Acceptance Criteria

### Tests That Must Pass

1. New regression test proves `validateGameDef` does not throw when malformed `actionPipelines` omit `costEffects`.
2. Existing suite: targeted engine validator tests plus workspace verification.

### Invariants

1. `validateGameDef` must never throw on structurally incomplete `actionPipelines` entries
2. No game-specific logic in kernel validation

## Test Plan

### New/Modified Tests

1. Add unit regression test in `packages/engine/test/unit/validate-gamedef.test.ts` with an `as unknown as GameDef` action pipeline missing `costEffects`.
2. Assert that `validateGameDef` does not throw and still returns a diagnostics array for malformed input.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Added a defensive guard in `validateActionPipelines` so `costEffects` is iterated as `(actionPipeline.costEffects ?? [])`.
  - Added a regression test in `packages/engine/test/unit/validate-gamedef.test.ts` proving `validateGameDef` does not throw when a malformed `actionPipeline` omits `costEffects`.
  - Added shared helper `forEachDefined` in `packages/engine/src/kernel/validate-gamedef-utils.ts` and used it in pipeline validation (`costEffects`, `stage.effects`) to standardize null-safe validator iteration.
- **Deviations from original plan**:
  - The first draft of the new test asserted a specific downstream diagnostic path; this was narrowed to the core invariant (`no throw`) to avoid coupling the regression to unrelated fixture/property assumptions.
  - Post-ticket architectural refinement replaced inline `?? []` iterations with shared helper usage in the touched validator to reduce duplication and drift risk.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
