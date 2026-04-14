# 128FULSCODRA-005: Convert remaining tracker-backed lifecycle files to draft mutations

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel phase-advance, action-usage, event-execution, boundary-expiry
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

After tickets 003 and 004, the remaining owned runtime spread sites for the `applyMoveCore` draft path are concentrated in `phase-advance.ts`, `action-usage.ts`, and `event-execution.ts`. Some older draft claims in this ticket were too broad: shared immutable helpers and probe-state construction outside the tracker-backed runtime path must remain unchanged.

## Assumption Reassessment (2026-04-14)

1. `phase-advance.ts` has 4-8 spread sites (including `...progressedState` variants). Confirmed.
2. `action-usage.ts` has 4 spread sites. Confirmed.
3. `event-execution.ts` has 1 spread site. Confirmed.
4. `grant-lifecycle.ts` spread sites are shared immutable helpers, not owned tracker-backed runtime mutations. Confirmed.
5. `free-operation-viability.ts` spread sites are probe/analysis-state construction and must remain immutable. Confirmed.
6. `advanceToDecisionPoint` returns `GameState` directly and live callers rely on that return value. Confirmed.
7. `boundary-expiry.ts` must forward `tracker` into lasting-effect expiry for the mutable path to be reachable. Confirmed.

## Architecture Check

1. This ticket now owns only the remaining tracker-backed lifecycle/runtime mutation sites. Shared immutable authorities stay shared.
2. No game-specific logic — all files operate on generic `GameState` infrastructure.
3. `advanceToDecisionPoint` must keep returning `GameState`; the mutable optimization happens inside the function, not by changing its public contract.

## What to Change

### 1. `phase-advance.ts` — convert tracker-backed phase transition sites

Convert tracker-backed phase/turn transition sites to direct mutations. Key patterns:
- tracker-backed `currentPhase` / `turnCount` / `activePlayer` updates mutate the existing draft state
- tracker-backed `turnOrderState` updates clone once with `ensureTurnOrderStateCloned(...)` before nested writes
- tracker-backed running-hash updates assign `_runningHash` directly after reconciliation

`advanceToDecisionPoint(...)` continues to return `GameState`; only its internal tracker-backed transitions are converted.

### 2. `action-usage.ts` — convert tracker-backed usage updates

Convert action usage tracking updates to direct mutations:
- no-tracker callers keep the immutable return behavior
- tracker-backed callers use `ensureActionUsageCloned(state, tracker)` and assign usage entries in place

### 3. `event-execution.ts` and `boundary-expiry.ts` — convert active lasting-effects updates

Convert the event state update spread (likely `{ ...state, activeLastingEffects: ... }`) to:
- `ensureActiveLastingEffectsCloned(state, tracker); state.activeLastingEffects = newEffects`
- thread `tracker` through boundary expiry so lasting-effect expiration can use the mutable path

### 4. Leave shared immutable helpers unchanged

Do not convert:
- `grant-lifecycle.ts` shared immutable helper authorities
- `free-operation-viability.ts` probe/analysis-state construction
- public `advanceToDecisionPoint(...)` return shape
- already-landed hash-boundary work from ticket 002

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/action-usage.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/boundary-expiry.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/action-usage.test.ts` (modify)
- `packages/engine/test/unit/kernel/zobrist-incremental-phase.test.ts` (verify-focused lane; modify only if needed)

## Out of Scope

- Converting effect handler files (ticket 003)
- Converting turn flow files (ticket 004)
- Converting shared immutable grant/probe helpers
- Property-based equivalence tests (ticket 006)
- Performance benchmarking (ticket 007)

## Acceptance Criteria

### Tests That Must Pass

1. All existing phase advance tests pass with identical behavior
2. All existing action usage tests pass
3. All existing determinism tests pass with identical stateHash values
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): all state transitions produce identical results
2. `advanceToDecisionPoint` keeps its returned `GameState` contract while mutating tracker-backed drafts internally
3. Spread sites in probe/analysis paths outside the tracker-backed runtime path are NOT converted
4. COW helpers are called before nested mutations

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — verify phase transitions produce identical outcomes and tracker-backed mutation preserves the return contract
2. `packages/engine/test/unit/action-usage.test.ts` — verify action usage tracking is deterministic and tracker-backed mutation preserves immutable fallback behavior

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/action-usage.test.js dist/test/unit/phase-advance.test.js dist/test/unit/kernel/zobrist-incremental-phase.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed on 2026-04-14.
- `phase-advance.ts` now mutates tracker-backed phase/turn transitions and running-hash updates in place while preserving the public `advanceToDecisionPoint(...) -> GameState` contract.
- `action-usage.ts` now supports tracker-backed in-place usage resets/increments while preserving immutable fallback behavior for shared callers.
- `event-execution.ts` and `boundary-expiry.ts` now thread tracker-backed active-lasting-effect updates through the boundary-expiry path.
- `phase-advance.test.ts` and `action-usage.test.ts` now cover the tracker-backed mutation path; `zobrist-incremental-phase.test.ts` was exercised unchanged as the focused invariant lane.
- `grant-lifecycle.ts`, `free-operation-viability.ts`, and `apply-move.ts` were correctly left unchanged after reassessment because they remain shared immutable/probe authority or already-landed work from ticket 002.
- Verification passed:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/action-usage.test.js dist/test/unit/phase-advance.test.js dist/test/unit/kernel/zobrist-incremental-phase.test.js`
  - `pnpm -F @ludoforge/engine test`
