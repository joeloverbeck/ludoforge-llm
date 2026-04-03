# 63PROFSPR-003: Conditional — reduce phase-advance.ts turnOrderState spreads

**Status**: 🚫 NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel phase-advance state construction
**Deps**: `archive/tickets/63PROFSPR-001.md`, `archive/specs/63-scoped-draft-state.md`

## Problem

`phase-advance.ts` contains 14 nested spread sites for `turnOrderState` construction:

```typescript
{ ...state, turnOrderState: { type: 'cardDriven', runtime: { ...runtime, ... } } }
```

Each spread copies the entire `GameState` (~19 fields) plus the nested `turnOrderState` and `runtime` objects. These run per phase advance (per decision point).

**This ticket is CONDITIONAL**: only actionable if `63PROFSPR-001` profiling shows `phase-advance.ts` turnOrderState spreads exceed 3% CPU. If profiling shows < 3%, close this ticket as "not actionable."

## Gate Result (2026-04-03)

`63PROFSPR-001` completed the required perf attribution and did not find the `phase-advance.ts` turn-order spreads above the focused report floor. This ticket is therefore not actionable and should not proceed unless a future profiling run produces stronger contrary evidence.

## Assumption Reassessment (2026-04-03)

1. `phase-advance.ts` has 14 spread sites involving state/turnOrderState — verified via codebase exploration
2. Phase advances occur per decision point (called from `advanceToDecisionPoint` loop) — per-move frequency, not per-effect
3. `advanceToDecisionPoint` receives state that has passed through the mutable draft scope — the state MAY already be a `MutableGameState` cast back to `GameState`. Needs verification during implementation.
4. `turnOrderState` is a discriminated union (`roundRobin | fixedOrder | cardDriven`) — the `cardDriven` variant has a nested `runtime` object with ~10 fields. Verified in types-core.ts.

## Architecture Check

1. Foundation 11 permits scoped internal mutation — same justification as 63PROFSPR-002. Phase advance functions receive fresh state objects from `applyEffectsWithBudgetState` finalization.
2. No game-specific logic — phase advancement is generic kernel behavior.
3. Complexity risk: turnOrderState is a discriminated union with nested structures. Direct field assignment requires careful handling of the union branches to avoid type-system violations.

## What to Change

### 1. Identify which spread sites receive fresh (mutable-safe) state

Trace the `state` parameter through each phase-advance function to verify it is NOT the caller's original state. Only sites that receive fresh state (from `advanceToDecisionPoint` inner loop, from lifecycle dispatch, etc.) are safe for direct mutation.

### 2. Replace safe spread sites with direct field assignment

For each verified-safe site, cast to `MutableGameState` and assign directly:

Before:
```typescript
const nextState = { ...state, turnOrderState: { type: 'cardDriven', runtime: { ...runtime, currentCard: newCard } } };
```

After:
```typescript
const mutableState = state as MutableGameState;
(mutableState.turnOrderState as Mutable<CardDrivenTurnOrderState>).runtime = { ...runtime, currentCard: newCard };
```

Note: the nested `runtime` spread may still be needed if only some runtime fields change. The optimization targets the OUTER state spread, not the inner runtime spread.

### 3. Leave unsafe sites unchanged

Sites where the state parameter could be the caller's input (e.g., the initial `advancePhase` entry point) must NOT be mutated. Leave their spreads intact.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify — subset of 14 spread sites)

## Out of Scope

- Changing EffectCursor or any hot-path object shape
- Modifying the inner `runtime` object construction (nested spreads are small objects, V8-efficient)
- Changes to apply-move.ts (covered by 63PROFSPR-002)
- Any changes if profiling shows < 3% CPU for this category

## Acceptance Criteria

### Tests That Must Pass

1. Phase advancement produces identical state transitions — existing phase-advance tests pass
2. FITL playbook golden replay produces identical traces
3. Turn flow eligibility tests pass unchanged
4. Coup phase entry/exit tests pass unchanged
5. Existing suite: `pnpm turbo test`

### Invariants

1. External contract unchanged — `advancePhase` and `advanceToDecisionPoint` return new state objects
2. No caller-visible state mutation — only fresh intermediate states are mutated
3. Determinism preserved — same phase sequence = same output state
4. No new fields added to any hot-path object

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/phase-advance.test.ts` — verify input state isolation for `advancePhase` entry point

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
4. Benchmark: `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200` — compare against 002's result. Reject if not measurably faster.
