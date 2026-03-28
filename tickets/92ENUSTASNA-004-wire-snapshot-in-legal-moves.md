# 92ENUSTASNA-004: Wire snapshot creation in enumerateRawLegalMoves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — legal-moves.ts snapshot creation and threading
**Deps**: 92ENUSTASNA-003 (pipeline policy must accept snapshot parameter)

## Problem

The snapshot module exists (001), compiled predicates accept it (002), and the pipeline policy threads it (003). The final wiring step: create the snapshot at the top of `enumerateRawLegalMoves` and pass it to every `evaluateDiscoveryPipelinePredicateStatus` call site within that function.

## Assumption Reassessment (2026-03-28)

1. `enumerateRawLegalMoves` is defined at line ~1150 of `legal-moves.ts` — confirmed. Signature: `(def, state, options?, runtime?) => RawLegalMoveEnumerationResult`.
2. There are 4 call sites of `evaluateDiscoveryPipelinePredicateStatus` in `legal-moves.ts` — confirmed (lines ~476, ~892, ~982, ~1307).
3. `state.activePlayer` is accessed within `enumerateRawLegalMoves` to determine the active player — need to verify the exact access pattern.
4. The snapshot is a local variable — not stored on any object, discarded when the function returns.

## Architecture Check

1. The snapshot is created as a `const` local variable at the top of `enumerateRawLegalMoves`, immediately after parameter extraction. It is passed by reference to evaluation calls — no copying overhead.
2. No new fields on any kernel object. The snapshot lives only in the function's local scope (F7 immutability exception: lazy caches are scoped to this single synchronous call).
3. The snapshot is computed from `def`, `state`, and `activePlayer` — all available at function entry. O(1) creation cost (eager fields are reference copies; lazy fields are closure allocations).

## What to Change

### 1. Import `createEnumerationSnapshot`

Add import of `createEnumerationSnapshot` and `EnumerationStateSnapshot` type from `./enumeration-snapshot.js`.

### 2. Create snapshot at function entry

At the top of `enumerateRawLegalMoves`, after determining `activePlayer`:

```typescript
const snapshot = createEnumerationSnapshot(def, state, activePlayer);
```

Where `activePlayer` is resolved from `state` (using the same mechanism already used in the function).

### 3. Pass snapshot to all `evaluateDiscoveryPipelinePredicateStatus` call sites

All 4 call sites of `evaluateDiscoveryPipelinePredicateStatus` in `legal-moves.ts` gain the snapshot as the final argument:

```typescript
evaluateDiscoveryPipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
  includeCostValidation: pipeline.atomicity === 'atomic',
}, snapshot)
```

### 4. Pass snapshot to `evaluateDiscoveryStagePredicateStatus` call sites (if any)

Verify and update any stage-level evaluation calls within `enumerateRawLegalMoves`.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)

## Out of Scope

- Creating the snapshot module (ticket 001)
- Modifying compiled closure bodies (ticket 002)
- Modifying pipeline policy signatures (ticket 003)
- Passing snapshot to non-enumeration contexts (e.g., `applyMove`, effect execution, `legalChoicesDiscover` outside of legalMoves)
- Modifying the `legalMoves` or `enumerateLegalMoves` public wrappers' signatures
- Performance benchmarking (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. Integration test: `enumerateRawLegalMoves` on a FITL game state produces identical moves with and without the snapshot wiring (determinism check — same def + same state + same seed = same legal moves).
2. Integration test: `legalMoves` public API produces identical results to before this change for multiple game states.
3. Existing suite: `pnpm turbo test --force`
4. Existing FITL e2e tests pass without any assertion changes.

### Invariants

1. `enumerateRawLegalMoves` produces identical move sets before and after this change for all inputs (behavioral equivalence).
2. The snapshot is a local variable — not stored on `GameDefRuntime`, `ReadContext`, `EffectCursor`, `Move`, or any other kernel object.
3. The snapshot is created once per `enumerateRawLegalMoves` call and discarded when the function returns.
4. No changes to the public `legalMoves` or `enumerateLegalMoves` function signatures.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/enumeration-snapshot-wiring.test.ts` — compiles a production FITL spec, creates multiple game states, verifies `legalMoves` output is identical before and after snapshot wiring. Uses `compileProductionSpec()` helper.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="enumeration-snapshot-wiring"`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
