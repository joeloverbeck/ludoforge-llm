# KERGAMLOOTRI-004 - Apply Move Validation, Atomicity, and Usage Counters

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-003`

## Goal
Implement the first production `applyMove` action-resolution path: validate move legality, apply cost/effects atomically, update usage counters, dispatch root action trigger, and refresh deterministic state hash.

## Reassessed Baseline (Current Repository)
- `src/kernel/apply-move.ts` is still a stub that throws `not implemented`.
- `test/unit/apply-move.test.ts` does not exist yet.
- `test/unit/game-loop-api-shape.test.ts` currently asserts `applyMove` throws `not implemented`; this must be updated as part of this ticket.
- `dispatchTriggers` currently supports root trigger dispatch and depth truncation logging, but does not yet implement recursive emitted-event cascades.
- `advancePhase` / turn advancement and `terminalResult` remain out of scope and unimplemented in this ticket sequence.

## Scope
- Implement `validateMove` in `src/kernel/apply-move.ts` with descriptive illegal-move errors that include move/action context.
- Implement `applyMove` execution flow in `src/kernel/apply-move.ts`:
  - immutable starting snapshot (no in-place mutation of input)
  - apply `cost` then `effects`
  - increment action usage counters on success
  - dispatch root `actionResolved` event via existing `dispatchTriggers`
  - recompute and set `stateHash` using existing Zobrist helpers
- Ensure failure at any step throws and leaves caller-provided input state unchanged (atomicity guarantee).
- Update API-shape expectations so tests reflect implemented `applyMove` behavior.

## File List Expected To Touch
- `src/kernel/apply-move.ts`
- `src/kernel/action-usage.ts` (only if a small helper improves counter update clarity)
- `test/unit/apply-move.test.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (adjust stale `not implemented` expectation)

## Out Of Scope
- Full phase/turn advancement policy.
- No-legal-move auto-advance loop.
- Terminal result evaluation.
- Trigger cascade depth-limit policy internals beyond root dispatch usage.
- Incremental hash-delta optimization (full hash recomputation is acceptable here).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/apply-move.test.ts`
  - legal move applies cost and effects in order.
  - action usage increments after successful move.
  - illegal move throws with `actionId`, params, and reason details.
  - failed move path does not mutate original input state object graph.
  - post-move hash changes and matches `computeFullHash` recomputation.
  - root `actionResolved` trigger firings are returned in `triggerFirings`.
- Updated API-shape compatibility:
  - `test/unit/game-loop-api-shape.test.ts`
- Existing effect runtime tests remain green:
  - `test/unit/effects-runtime.test.ts`

## Invariants That Must Remain True
- `applyMove` is total for legal moves (no throw on legal input).
- Cost application precedes main effects.
- No partial mutation is externally visible on failure.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented `applyMove` in `src/kernel/apply-move.ts` with internal legality validation, cost-then-effects ordering, action usage increment, root `actionResolved` trigger dispatch, and recomputed `stateHash`.
  - Added `incrementActionUsage` helper in `src/kernel/action-usage.ts`.
  - Added `test/unit/apply-move.test.ts` covering legal execution, illegal move diagnostics, atomic failure behavior, trigger logging, and hash recomputation.
  - Updated `test/unit/game-loop-api-shape.test.ts` to remove stale `not implemented` expectation for `applyMove`.
- **Deviations from original plan**:
  - Kept hash update as full recomputation via existing `computeFullHash` (explicitly allowed by ticket scope), without incremental hash delta work.
  - Kept `validateMove` internal to `apply-move.ts` (no public API expansion).
- **Verification results**:
  - Ran `npm test` successfully (includes build + unit/integration), with new `dist/test/unit/apply-move.test.js` passing.
