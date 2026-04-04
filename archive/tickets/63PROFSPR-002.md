# 63PROFSPR-002: Eliminate GameState spreads in apply-move.ts hash assignment

**Status**: 🚫 NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel apply-move return path
**Deps**: `archive/tickets/63PROFSPR-001.md`, `archive/specs/63-scoped-draft-state.md`

## Problem

Two sites in `apply-move.ts` spread the entire `GameState` (~19 top-level fields) just to assign 1-2 hash fields. This runs once per move (200+ times per game), creating unnecessary allocation pressure and GC load.

## Gate Result (2026-04-03)

`63PROFSPR-001` completed the required perf attribution and did not find the `apply-move.ts` hash-assignment spreads above the focused report floor. This ticket is therefore not actionable and should not proceed unless a future profiling run produces stronger contrary evidence.

```typescript
// Line ~1355: applyTrustedMove return path
const stateWithHash = { ...progressedState, stateHash: reconciledHash, _runningHash: reconciledHash };

// Line ~1561: commitSimultaneousMoves return path
const finalState = { ...progressedState, stateHash: computeFullHash(table, progressedState) };
```

## Assumption Reassessment (2026-04-03)

1. `progressedState` at line ~1355 is produced by `advanceToDecisionPoint` — a fresh object, not the caller's input state. Verified by reading `apply-move.ts:1300-1360`.
2. `progressedState` at line ~1561 is produced by `advancePhaseAndDecisionPoint` in the `commitSimultaneousMoves` path — also a fresh object. Verified by reading `apply-move.ts:1540-1570`.
3. `MutableGameState` type exists in `state-draft.ts:23` as `Mutable<GameState>` — a type-level cast, zero runtime cost. Verified.
4. No intermediate readers observe `progressedState` between the spread and the return — the hash assignment is the LAST operation before return. Verified by reading surrounding code.
5. The `stateHash` and `_runningHash` fields exist on `GameState` (types-core.ts). Verified.

## Architecture Check

1. Foundation 11 explicitly permits scoped internal mutation: "Within a single synchronous effect-execution scope, the kernel MAY use a private draft state." `progressedState` is a fresh object within `applyTrustedMove`'s scope — assigning fields directly is a scoped mutation with no aliasing risk.
2. No game-specific logic — this is a generic kernel optimization applicable to all games.
3. No backwards-compatibility shims — the external contract `applyMove(state) → newState` is unchanged.

## What to Change

### 1. Import MutableGameState in apply-move.ts

Add a type-only import of `MutableGameState` from `state-draft.ts`:

```typescript
import type { MutableGameState } from './state-draft.js';
```

### 2. Replace spread at applyTrustedMove return path (~line 1355)

Before:
```typescript
const stateWithHash = {
  ...progressedState,
  stateHash: reconciledHash,
  _runningHash: reconciledHash,
};
```

After:
```typescript
const stateWithHash = progressedState as MutableGameState;
stateWithHash.stateHash = reconciledHash;
stateWithHash._runningHash = reconciledHash;
```

### 3. Replace spread at commitSimultaneousMoves return path (~line 1561)

Before:
```typescript
const finalState = {
  ...progressedState,
  stateHash: computeFullHash(table, progressedState),
};
```

After:
```typescript
const finalState = progressedState as MutableGameState;
finalState.stateHash = computeFullHash(table, progressedState);
```

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify — 2 spread sites + 1 import)

## Out of Scope

- Modifying any other spread sites (phase-advance.ts, effects-control.ts, EffectCursor)
- Changing EffectCursor shape or adding fields to any hot-path object
- Removing dead fallback branches in effect handlers
- Any changes to state-draft.ts itself

## Acceptance Criteria

### Tests That Must Pass

1. Input state isolation: `applyMove(state, move)` must not modify `state` — the caller's reference is untouched
2. Determinism: same seed + same moves = identical `stateHash` and `_runningHash` on output
3. FITL playbook golden replay produces identical traces
4. FITL policy summary golden matches
5. Existing suite: `pnpm turbo test`

### Invariants

1. External contract `applyMove(state) → newState` unchanged — input state immutable
2. `stateHash` and `_runningHash` on output state are identical to spread-based computation
3. No new fields added to any hot-path object (EffectCursor, GameDefRuntime, GameState)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add or verify isolation test: deep-freeze input state before `applyMove`, assert no throw (proves input not mutated)

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. Benchmark: `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200` — compare `combined_duration_ms` against 001's baseline. Reject if not measurably faster.
