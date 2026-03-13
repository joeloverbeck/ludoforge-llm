# DECINSARC-001: Create DecisionKey, DecisionScope types and codec functions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module `decision-scope.ts`
**Deps**: None

## Problem

The engine lacks a first-class decision identity model. Decision key strings are constructed ad hoc across multiple modules (`effects-choice.ts`, `move-decision-sequence.ts`, `legal-choices.ts`, test helpers) with no single source of truth. This ticket creates the authoritative codec module.

## Assumption Reassessment (2026-03-13)

1. `decision-occurrence.ts` (123 lines) defines mutable `DecisionOccurrenceContext` with `Map<string, number>` counters — confirmed exists, will be replaced in later ticket.
2. `decision-id.ts` (49 lines) defines `composeScopedDecisionId()` and `extractResolvedBindFromDecisionId()` — confirmed exists, will be absorbed in later ticket.
3. No existing `decision-scope.ts` file — confirmed, this is a new file.

## Architecture Check

1. Pure functions (no class) keep the codec simple, testable, and tree-shakeable.
2. `DecisionKey` and `DecisionScope` are fully game-agnostic — no game-specific identifiers.
3. No backwards-compatibility shims — this is a clean new module.

## What to Change

### 1. Create `packages/engine/src/kernel/decision-scope.ts`

Define:
- `DecisionKey` branded string type: `type DecisionKey = string & { readonly __brand: 'DecisionKey' }`
- `DecisionScope` interface: `{ readonly iterationPath: string; readonly counters: Readonly<Record<string, number>> }`
- `ScopeAdvanceResult` interface: `{ readonly scope: DecisionScope; readonly key: DecisionKey; readonly occurrence: number }`
- `emptyScope()`: returns `{ iterationPath: '', counters: {} }`
- `advanceScope(scope, internalDecisionId, resolvedBind)`: increments counter for the composite base key, returns new scope + `DecisionKey` + 1-based occurrence
- `withIterationSegment(scope, index)`: returns new scope with `[N]` appended to `iterationPath`
- `formatDecisionKey(internalDecisionId, resolvedBind, iterationPath, occurrence)`: produces canonical key per spec format table
- `parseDecisionKey(key)`: parses back to `{ baseId, resolvedBind, iterationPath, occurrence } | null`

Canonical key format rules:
- `#1` suffix never written (first occurrence is unindexed)
- When `internalDecisionId === resolvedBind` and no iteration path, key is just `{resolvedBind}`
- `::` separates template id from resolved bind
- `[N]` segments encode forEach iteration path

### 2. Export from `packages/engine/src/kernel/index.ts`

Add `export * from './decision-scope.js'` (alongside existing exports — do NOT remove old exports yet).

## Files to Touch

- `packages/engine/src/kernel/decision-scope.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)

## Out of Scope

- Modifying `decision-occurrence.ts` or `decision-id.ts` (deleted in DECINSARC-004)
- Modifying `ChoicePendingRequest`, `EffectContextBase`, or `EffectResult` types (DECINSARC-002)
- Modifying any effect execution code (DECINSARC-003, DECINSARC-004)
- Modifying any runner code (DECINSARC-007)
- Modifying any test helpers (DECINSARC-006)
- Deleting any existing files

## Acceptance Criteria

### Tests That Must Pass

1. `formatDecisionKey` produces correct keys for all 7 canonical format scenarios from the spec table:
   - Simple bind `$target` → `$target`
   - Simple bind 2nd occurrence → `$target#2`
   - Template `decision:attack` resolved to `Quang_Tri` → `decision:attack::Quang_Tri`
   - Same 2nd occurrence → `decision:attack::Quang_Tri#2`
   - forEach iteration 0 → `decision:train::Saigon[0]`
   - forEach iteration 0, 2nd occurrence → `decision:train::Saigon[0]#2`
   - Nested forEach → `decision:op::Saigon[0][1]`
2. `parseDecisionKey` round-trips all 7 key formats (format → parse → reformat = identical)
3. `advanceScope` returns a new scope object (input scope is not mutated)
4. `advanceScope` increments counters correctly for repeated calls with same base key
5. `withIterationSegment` appends `[N]` to iteration path without mutating input
6. `emptyScope` returns zero counters and empty iteration path
7. First occurrence serializes unindexed; second and later serialize with `#N`
8. Existing full suite: `pnpm turbo test` still passes (no regressions — this is additive)
9. Build passes: `pnpm turbo build`
10. Typecheck passes: `pnpm turbo typecheck`

### Invariants

1. `DecisionKey` is produced exclusively by `formatDecisionKey()` — no handcrafted key strings in the new module.
2. `DecisionScope` is immutable — `advanceScope` and `withIterationSegment` return new objects, never mutate.
3. `emptyScope()` produces a scope with zero counters and empty iteration path.
4. No game-specific identifiers appear anywhere in the module.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-scope.test.ts` — comprehensive unit tests for all codec functions, round-trip parsing, immutability proofs, occurrence numbering

### Commands

1. `node --test packages/engine/dist/test/unit/kernel/decision-scope.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
