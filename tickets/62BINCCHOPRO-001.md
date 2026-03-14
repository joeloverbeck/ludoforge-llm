# 62BINCCHOPRO-001: Extend `ChoicePendingRequest` with incremental selection state

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types
**Deps**: None (type-only change, no behavioral dependencies)

## Problem

`ChoicePendingRequest` for `chooseN` has no way to express engine-owned selection state. The runner currently owns multi-select state locally, which prevents the kernel from driving stepwise legality recomputation. Two new optional fields are needed so the kernel can communicate incremental selection progress back to callers.

## Assumption Reassessment (2026-03-14)

1. `ChoicePendingRequest` is defined in `packages/engine/src/kernel/types-core.ts` (lines ~621-633). Confirmed.
2. The type has `type: 'chooseOne' | 'chooseN'`, `options`, `min?`, `max?`, `decisionPlayer?`, `targetKinds`, `decisionKey`, `name`. Confirmed.
3. `ChoicePendingRequest` is part of the `ChoiceRequest` union and is used by `legalChoicesDiscover`, `legalChoicesEvaluate`, runner store, runner bridge, and AI agents. All consumers must tolerate new optional fields without breakage.
4. No existing `selected` or `canConfirm` fields exist. Confirmed.

## Architecture Check

1. Adding optional fields to an existing type is backwards-compatible — no consumer breaks.
2. `selected` is engine state, not UI-local state. This moves selection authority to the kernel.
3. `canConfirm` is a computed convenience — the kernel derives it from cardinality rules and current selection count. Callers should not recompute it.
4. Both fields are only meaningful when `type === 'chooseN'`. For `chooseOne`, they remain undefined.

## What to Change

### 1. Add `selected` field to `ChoicePendingRequest`

In `packages/engine/src/kernel/types-core.ts`, add:

```ts
selected?: readonly MoveParamScalar[];
```

This holds the engine-owned current selection state for an in-progress `chooseN` decision. Defaults to `undefined` (or `[]` when the incremental protocol is active).

### 2. Add `canConfirm` field to `ChoicePendingRequest`

In `packages/engine/src/kernel/types-core.ts`, add:

```ts
canConfirm?: boolean;
```

Computed by the engine: `true` when `selected.length >= min` (and any other cardinality/legality constraints are satisfied). `false` otherwise.

### 3. Export the new fields in the public API

Ensure `selected` and `canConfirm` are visible to runner, bridge, and test consumers through the existing export path.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add two optional fields to `ChoicePendingRequest`)

## Out of Scope

- Populating `selected` or `canConfirm` at runtime (ticket 62BINCCHOPRO-004)
- The `advanceChooseN` function (ticket 62BINCCHOPRO-004)
- Tier-admissibility logic (ticket 62BINCCHOPRO-002)
- Runner store/bridge changes (tickets 62BINCCHOPRO-005, -006)
- Any behavioral change to `legalChoicesDiscover` or `effects-choice.ts`
- Schema artifact changes (JSON Schemas are generated separately)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds — the new fields compile without errors
2. `pnpm turbo typecheck` succeeds — no type errors introduced
3. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions (all existing tests pass unchanged)

### Invariants

1. `ChoicePendingRequest` remains backwards-compatible — all existing consumers compile without modification
2. `selected` and `canConfirm` are optional — omitting them produces identical behavior to today
3. No runtime behavior changes — this is a type-only addition

## Test Plan

### New/Modified Tests

No new tests required for this ticket — it is a type-only addition. Behavioral tests land in ticket 62BINCCHOPRO-004.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
