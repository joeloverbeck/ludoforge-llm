# 80INCZOBHAS-005: Instrument Phase and Turn-Flow Handlers with Incremental Hash Updates

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effects-turn-flow.ts, phase-advance.ts, phase-lifecycle.ts, apply-move.ts (phase transition paths)
**Deps**: 80INCZOBHAS-001

## Problem

Phase and turn-flow operations modify multiple hashed features simultaneously:
`currentPhase`, `turnCount`, `activePlayer`, and `actionUsage`. These mutations
happen both in effect handlers (`gotoPhaseExact`, `advancePhase`) and in direct
state manipulation during phase transitions (`phase-advance.ts`,
`phase-lifecycle.ts`). This is the most complex ticket because phase transitions
can cascade — advancing one phase may trigger lifecycle events that modify state
further, and the hash must track all changes.

## Assumption Reassessment (2026-03-24)

1. `applyGotoPhaseExact` is in `effects-turn-flow.ts` (~line 376) — jumps to a specific phase — confirmed.
2. `applyAdvancePhase` is in `effects-turn-flow.ts` (~line 444) — advances to next phase in sequence — confirmed.
3. `advanceToDecisionPoint()` in `phase-advance.ts` advances through phases until reaching a decision point — it is called from `applyMoveCore` after effects are applied — confirmed.
4. `phase-lifecycle.ts` dispatches lifecycle events (turnStart, phaseEnter, phaseExit) which may themselves modify state — confirmed.
5. `computeFullHash` is also called in `phase-lifecycle.ts` for compiled-effect verification (comparing compiled vs interpreted results) — this call must be preserved, it's a correctness check unrelated to incremental hashing — confirmed.
6. ZobristFeature kinds affected: `currentPhase`, `turnCount`, `activePlayer`, `actionUsage` — confirmed.
7. `actionUsage` tracks per-action usage records reset on phase/turn boundaries — confirmed.
8. Phase transitions in `advanceToDecisionPoint` may create intermediate states — hash must be correct at each intermediate state.

## Architecture Check

1. Effect handlers (`gotoPhaseExact`, `advancePhase`) operate within the mutable-state scope and can call hash helpers directly.
2. Phase transitions in `phase-advance.ts` and `phase-lifecycle.ts` are trickier — they may or may not run within a mutable-state scope. Need to verify whether `advanceToDecisionPoint` operates on a `MutableGameState` or creates frozen snapshots.
3. The `computeFullHash` call in `phase-lifecycle.ts` (compiled-effect verification) must be kept — it compares two independent computations and is unrelated to the incremental optimization.
4. Engine-agnosticism preserved — phase/turn/action concepts are generic kernel features.

## What to Change

### 1. `applyGotoPhaseExact` — currentPhase Feature

Capture old `state.currentPhase`. After setting new phase, call `updateRunningHash` with `{ kind: 'currentPhase', phaseId: oldPhase }` → `{ kind: 'currentPhase', phaseId: newPhase }`.

If `gotoPhaseExact` also resets `actionUsage`, capture old usage records and XOR them out, then XOR in the new (reset) usage records.

### 2. `applyAdvancePhase` — currentPhase + turnCount + activePlayer + actionUsage

This handler may modify multiple features:
- `currentPhase` (always changes)
- `turnCount` (may increment on phase wrap)
- `activePlayer` (may change based on turn order)
- `actionUsage` (may reset on new phase/turn)

Capture all old values before mutation. After mutation, issue `updateRunningHash` for each changed feature.

### 3. Phase Transitions in `phase-advance.ts`

`advanceToDecisionPoint()` iterates through phases. At each transition:
- Phase changes → update `currentPhase` feature
- Turn count may change → update `turnCount` feature
- Active player may change → update `activePlayer` feature
- Action usage may reset → update `actionUsage` features

Identify each mutation point and insert hash updates. If phase transitions operate on `MutableGameState`, this is straightforward. If they create new frozen states, hash updates must be computed alongside the state copy.

### 4. Phase Lifecycle in `phase-lifecycle.ts`

Lifecycle event dispatches (turnStart, phaseEnter, phaseExit) apply effects that may modify state. These effects are processed through `applyEffects`, which goes through effect handlers — so those handlers (tickets 002–004) already handle hash updates for the effects themselves.

**However**, any direct state mutations in lifecycle code (outside effect handlers) must also update the hash. Audit `phase-lifecycle.ts` for direct state mutations and add hash updates.

### 5. Preserve `computeFullHash` in Compiled-Effect Verification

The `computeFullHash` calls in `phase-lifecycle.ts` (~line 254–255) are for verifying compiled effects match interpreted effects. These must remain unchanged — they serve a different purpose.

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` (modify — gotoPhaseExact, advancePhase)
- `packages/engine/src/kernel/phase-advance.ts` (modify — hash updates during phase transitions)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — hash updates for direct state mutations, if any; preserve existing computeFullHash for verification)
- `packages/engine/src/kernel/apply-move.ts` (modify — ensure hash propagation through advanceToDecisionPoint call chain)

## Out of Scope

- Variable effect handlers (ticket 002).
- Token effect handlers (ticket 003).
- Marker effect handlers (ticket 004).
- Foundation changes to types-core.ts, zobrist.ts, initial-state.ts (ticket 001).
- Replacing `computeFullHash` in `applyMoveCore` final hash assignment (ticket 006).
- Verification mode or parity tests (ticket 007).
- Runner package changes.
- Removing or modifying the compiled-effect verification `computeFullHash` calls.

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `gotoPhaseExact` updates `_runningHash` for `currentPhase` feature change.
2. **Unit test**: `advancePhase` updates `_runningHash` for all affected features (phase, turn, player, action usage).
3. **Integration test**: A sequence of phase transitions via `advanceToDecisionPoint` produces `_runningHash === computeFullHash(table, finalState)` at each intermediate and final state.
4. **Integration test**: Lifecycle event dispatch does not double-count hash updates (effects update hash via their handlers; lifecycle code updates hash for its own direct mutations only).
5. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.
6. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. After any phase/turn-flow operation, `_runningHash` reflects the XOR-diff of all changed features (currentPhase, turnCount, activePlayer, actionUsage).
2. The compiled-effect verification `computeFullHash` calls in `phase-lifecycle.ts` remain unchanged and functional.
3. Phase transitions that don't change a feature (e.g., phase stays the same) produce no net hash change for that feature.
4. `actionUsage` reset correctly XORs out all old usage records and XORs in the new (zeroed) records.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-phase.test.ts` — tests for gotoPhaseExact and advancePhase hash updates.
2. `packages/engine/test/integration/kernel/zobrist-phase-transitions.test.ts` — multi-phase transition hash parity test.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
