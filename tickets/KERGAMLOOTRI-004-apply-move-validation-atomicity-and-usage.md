# KERGAMLOOTRI-004 - Apply Move Validation, Atomicity, and Usage Counters

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-003`

## Goal
Implement the core `applyMove` action-resolution path: validate move legality, apply cost/effects atomically, update usage counters, and return trigger logs.

## Scope
- Implement `validateMove` with descriptive illegal-move errors.
- Implement `applyMove` execution flow:
  - immutable starting snapshot
  - apply `cost` then `effects`
  - increment action usage counters
  - dispatch root `actionResolved` event
  - update/validate `stateHash`
- Ensure failure at any step leaves input state unchanged (atomicity guarantee).

## File List Expected To Touch
- `src/kernel/apply-move.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/effects.ts` (only if non-breaking context plumbing is required for move params)
- `src/kernel/zobrist.ts` (only to consume existing incremental helpers; avoid new hash features)
- `test/unit/apply-move.test.ts` (new)

## Out Of Scope
- Full phase/turn advancement policy.
- No-legal-move auto-advance loop.
- Terminal result evaluation.
- Trigger cascade depth-limit policy internals (covered in trigger-specific ticket).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/apply-move.test.ts`
  - legal move applies cost and effects in order.
  - action usage increments after successful move.
  - illegal move throws with `actionId`, params, and reason.
  - failed move path does not mutate original input state object graph.
  - post-move hash changes and matches `computeFullHash` recomputation.
- Existing effect runtime tests remain green:
  - `test/unit/effects-runtime.test.ts`

## Invariants That Must Remain True
- `applyMove` is total for legal moves (no throw on legal input).
- Cost application precedes main effects.
- No partial mutation is externally visible on failure.
