# 75ENRLEGMOVENU-002: Classify Moves During Enumeration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal-moves.ts return types and classification logic
**Deps**: 75ENRLEGMOVENU-001 (ClassifiedMove type, alwaysCompleteActionIds)

## Problem

`enumerateLegalMoves` currently returns `readonly Move[]`. Agents then call `probeMoveViability` on each move individually — a redundant O(n) pass. This ticket integrates classification into `enumerateLegalMoves` so each move is probed exactly once, and always-complete moves skip probing entirely.

## Assumption Reassessment (2026-03-22)

1. `LegalMoveEnumerationResult` at `legal-moves.ts:85-88` has `moves: readonly Move[]` — changes to `readonly ClassifiedMove[]`.
2. `enumerateLegalMoves` at `legal-moves.ts:945` returns `LegalMoveEnumerationResult` — return type updates automatically.
3. `legalMoves` facade at `legal-moves.ts:1112-1117` returns `readonly Move[]` — changes to `readonly ClassifiedMove[]`.
4. `probeMoveViability` is exported from `apply-move.ts:1583-1588` — imported into `legal-moves.ts` for classification of non-always-complete moves.
5. `PerfProfiler` infrastructure exists — `perfStart/perfEnd` can be used for the `classifyMoves` profiling span.

## Architecture Check

1. Classification happens at the source (enumeration) rather than at each consumer — single-computation, multiple-consumption pattern.
2. Non-viable moves are filtered out with a warning, not silently dropped — preserves observability.
3. No opt-in flag — all callers receive `ClassifiedMove[]` unconditionally (Foundation 9).

## What to Change

### 1. Update `LegalMoveEnumerationResult` in `legal-moves.ts`

```typescript
export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];  // was: readonly Move[]
  readonly warnings: readonly RuntimeWarning[];
}
```

### 2. Add classification loop in `enumerateLegalMoves`

After the existing move collection logic (which produces `Move[]`), add a classification phase:

```
for each raw move:
  if runtime.alwaysCompleteActionIds.has(move.actionId):
    → create synthetic complete viability (zero-cost, no probe)
  else:
    → call probeMoveViability(def, state, move, runtime)
    → if viable: false → emit RuntimeWarning, skip this move
    → if viable: true → wrap as ClassifiedMove
```

Wrap the classification loop with `perfStart/perfEnd(profiler, 'classifyMoves', ...)`.

The synthetic complete viability for always-complete actions:
```typescript
{ viable: true, complete: true, move, warnings: [] }
```

### 3. Update `legalMoves` facade

Return type changes from `readonly Move[]` to `readonly ClassifiedMove[]`. Implementation: return `result.moves` which is already `readonly ClassifiedMove[]`.

### 4. Handle `runtime` parameter

`enumerateLegalMoves` already accepts an optional `runtime?: GameDefRuntime`. When `runtime` is undefined, create it via `createGameDefRuntime(def)` (same pattern used elsewhere in the kernel). The `alwaysCompleteActionIds` fast-path requires runtime.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — type change + classification loop)

## Out of Scope

- Changing agent interfaces (ticket 004)
- Changing simulator or runner code (ticket 005)
- Adding `skipMoveValidation` (ticket 003)
- Modifying `probeMoveViability` itself — it is called as-is
- Optimizing the shared preflight context (future optimization — not in Spec 75 MVP)

## Acceptance Criteria

### Tests That Must Pass

1. `enumerateLegalMoves` returns `ClassifiedMove[]` — each element has `.move` and `.viability`
2. Always-complete actions get `{ viable: true, complete: true }` without calling `probeMoveViability`
3. Non-always-complete actions get their viability from `probeMoveViability`
4. Non-viable moves are filtered out and a `RuntimeWarning` is emitted
5. `legalMoves` facade returns `readonly ClassifiedMove[]`
6. Profiler span `classifyMoves` is recorded when profiler is provided
7. When `runtime` is not provided, classification still works (runtime created internally)
8. Existing suite: `pnpm turbo test` — all existing tests pass (with necessary type adjustments in test files)
9. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. Every `ClassifiedMove` in the result has `viability.viable === true` — non-viable moves are never returned.
2. The `.move` field of each `ClassifiedMove` is identical to the `Move` that would have been returned before — no mutation or transformation of the Move object itself.
3. Move ordering is preserved — classification does not reorder moves.
4. Determinism: same `(def, state)` → same `ClassifiedMove[]` output (Foundation 5).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — update existing tests to expect `ClassifiedMove[]`, add tests for always-complete fast-path, non-viable filtering, profiler span
2. May need to update test helpers that construct or inspect `LegalMoveEnumerationResult`

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors
