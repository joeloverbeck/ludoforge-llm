# PIPEVAL-001: Add defensive guard on costEffects in pipeline validation

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None (standalone hardening)

## Problem

`validateActionPipelines` calls `actionPipeline.costEffects.forEach(...)` without a defensive `?? []` guard. The `ActionPipelineDef` type declares `costEffects` as required (`readonly costEffects: readonly EffectAST[]`), so well-formed GameDefs always have it. However, the validator's job is to handle malformed input gracefully — crashing on `undefined.forEach` is not graceful. The adjacent `stage.effects` field already has a `?? []` guard for exactly this reason.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.costEffects` is typed as required — confirmed at `types-operations.ts:31`.
2. Existing tests use `as unknown as GameDef` casts with `costEffects: []` — all tests currently provide the field, so no crash today.
3. The `stage.effects ?? []` guard was added in the same changeset for the same reason — consistency demands `costEffects` get the same treatment.

## Architecture Check

1. Validators should never crash on malformed input — they should diagnose it. Defensive guards are the established pattern (see `stage.effects ?? []`, `def.actionPipelines?.forEach`, `def.terminal?.checkpoints`).
2. No game-specific logic involved — this is purely engine-level validation robustness.
3. No backwards-compatibility shims — just adding a nullish coalescing guard.

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

- Adding structural diagnostics for missing `costEffects` (the Zod schema boundary check catches that)
- Other nullable field guards (already handled or not applicable)

## Acceptance Criteria

### Tests That Must Pass

1. Existing pipeline validation tests continue passing without providing `costEffects`
2. Existing suite: `pnpm turbo test --force`

### Invariants

1. `validateGameDef` must never throw on structurally incomplete `actionPipelines` entries
2. No game-specific logic in kernel validation

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a defensive guard, not a behavior change. Existing tests with `costEffects: []` already exercise the path.

### Commands

1. `pnpm turbo build && pnpm turbo test --force`
