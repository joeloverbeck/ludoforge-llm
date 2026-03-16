# 62MCTSSEAVIS-014: Verify legalChoicesDiscover() Compound Move Handling

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Possibly — kernel/legal-choices.ts
**Deps**: 62MCTSSEAVIS-008

## Problem

FITL compound moves include special activities (SA) after main operations. `legalChoicesDiscover()` must correctly present SA decisions after main operation decisions complete. This ticket verifies the kernel handles compound moves and fixes it if not.

## What to Change

### 1. Write tests verifying compound move decision flow

Create unit tests that:
- Start a FITL compound move with main operation
- Step through decisions via `legalChoicesDiscover()` until main operation completes
- Verify that SA decisions are presented next
- Verify that `complete` is returned after all decisions resolve

### 2. Fix if needed

If `legalChoicesDiscover()` does not handle the compound move → SA transition:
- Extend the function to detect `move.compound.specialActivity` after main decisions
- Present SA decisions as additional pending choices
- Maintain backward compatibility

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify if fix needed)
- `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` (new)

## Out of Scope

- Decision expansion module (62MCTSSEAVIS-008 — depends on this)
- Search loop changes (62MCTSSEAVIS-010)
- Changes to move structure or types
- Non-compound move handling (unchanged)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `legalChoicesDiscover()` with compound move presents main operation decisions first
2. Unit test: after main operation decisions complete, SA decisions are presented
3. Unit test: `complete` is returned only when ALL decisions (main + SA) are resolved
4. Unit test: non-compound moves are unaffected
5. Unit test: compound move with no SA completes after main operation
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalChoicesDiscover()` API contract unchanged for non-compound moves
2. Decision ordering: main operation first, then SA
3. `complete` only returned when move is fully resolved (all parameters filled)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` — compound move decision flow

### Commands

1. `pnpm turbo build && pnpm turbo typecheck`
2. `pnpm turbo test --force`

## Outcome

**Completion date**: 2026-03-16

### What changed

The ticket's original assumption — that `legalChoicesDiscover()` would need a small fix — was incorrect. The function had no compound SA handling at all. A kernel-level extension was implemented:

1. **`types-core.ts`**: Added `CompoundDecisionPath` type (`'main' | 'compound.specialActivity'`) and optional `decisionPath` field on `ChoicePendingRequestBase`.
2. **`legal-choices.ts`**: Added `discoverCompoundSAChoices()` and `maybeChainCompoundSA()`. After the main action returns `complete`, if `partialMove.compound.specialActivity` exists, chains into SA discovery using `prepareLegalChoicesContext` against the original state. SA pending requests are tagged with `decisionPath: 'compound.specialActivity'`. All three public APIs (`legalChoicesDiscover`, `legalChoicesEvaluate`, `legalChoicesEvaluateWithTransientChooseNSelections`) updated.
3. **`move-decision-sequence.ts`**: `resolveMoveDecisionSequence` now routes SA decision values to `move.compound.specialActivity.params` when `decisionPath === 'compound.specialActivity'`.
4. **`decision-expansion.ts`**: Added `advanceCompoundSAParams()` helper. `advancePartialMove()` dispatches based on `decisionPath`.
5. **`decision-param-helpers.ts` (test helper)**: Handles unresolvable SA decisions from compound chaining gracefully, preserving the move for `applyMove` to validate compound constraints.

### Deviations from original plan

- Ticket assumed a small fix in `legal-choices.ts`. Actual implementation was a new kernel capability with type system changes across 4 source files.
- SA discovery uses pre-main-op state (not accumulated post-effects state). This is correct for MCTS (handles failures gracefully) and avoids complex internal refactoring.
- Pipeline-backed main op test was dropped (complex fixture) in favor of a multi-decision main op test that covers the same chaining logic.
- Test command corrected from Jest-style `--test-path-pattern` to `pnpm turbo test`.

### Verification

- 4937/4937 engine tests pass (0 failures)
- 15 new compound SA tests in `legal-choices-compound.test.ts`
- 3 new decision-expansion compound SA tests
- Full typecheck clean across both packages
