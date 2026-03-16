# 63COMPDSACHAIN-001: Fix Compound SA Chaining Regression in legalChoicesEvaluate

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/legal-choices.ts, possibly move-decision-sequence.ts
**Deps**: archive/tickets/62MCTSSEAVIS-014-legal-choices-compound-move-verification.md

## Problem

62MCTSSEAVIS-014 added compound special activity (SA) decision chaining to `legalChoicesEvaluate`, `legalChoicesDiscover`, and `legalChoicesEvaluateWithTransientChooseNSelections`. After the main action's decisions return `complete`, `maybeChainCompoundSA` unconditionally chains into SA decision discovery using the **pre-main-op game state**.

This breaks all callers that pass a compound move with **already-resolved SA params**:

1. **FITL playbook golden test** — 8 of 9 subtests fail. Turn 1 ARVN Train+Govern is a compound move with fully-specified params for both the main action and the SA. `maybeChainCompoundSA` re-discovers Govern's `$targetSpaces` chooseN against the pre-main-op state, which offers a different options domain than the post-Train state the SA was authored against. The selection `an-loc:none` or `can-tho:none` is rejected as "outside options domain".

2. **FITL MCTS E2E replay** — scenarios S3–S10 crash during replay for the same reason (the replay infrastructure uses the same playbook moves).

### Root Cause

`maybeChainCompoundSA` has two architectural flaws:

**Flaw 1: No SA completeness check.** It chains into SA discovery whenever the main action is `complete` and `compound.specialActivity` exists — even if the SA's params already satisfy all required decisions. Fully-resolved compound moves should return `complete` without re-discovery.

**Flaw 2: Pre-main-op state for SA validation.** SA discovery calls `legalChoicesWithPreparedContextStrict(saContext, sa, shouldEvaluateOptionLegality, ...)` with the **original** state. When `shouldEvaluateOptionLegality` is `true` (as in `legalChoicesEvaluate`), this validates SA selections against options derived from the wrong state. The main action's effects may have changed zone contents, token positions, or variable values that alter what the SA's chooseN/chooseOne offers.

### Regression Scope

- **Introduced by**: commit `365fe665` (62MCTSSEAVIS-014)
- **Broken since**: all commits after 014 on the `spec62-update` branch
- **Not broken on `main`**: the golden test passes 9/9 on main
- **Affected tests**: `fitl-playbook-golden.test.ts` (8/9 fail), MCTS E2E replay for S3–S10
- **Unaffected**: S1 and S2 MCTS scenarios (turnIndex 0, no compound move replay needed), non-compound `legalChoicesEvaluate` calls, MCTS classification of non-compound moves

## Assumption Reassessment (2026-03-16)

1. `maybeChainCompoundSA` in `legal-choices.ts` lines 1078–1091 — **confirmed present**, unconditional chaining when `result.kind === 'complete'` and SA exists.
2. `discoverCompoundSAChoices` at lines 1050–1071 passes `state` (pre-main-op) to `prepareLegalChoicesContext` for SA — **confirmed**.
3. `legalChoicesEvaluate` passes `shouldEvaluateOptionLegality: true` to `maybeChainCompoundSA` — **confirmed**, this triggers validation of SA selections against pre-main-op options.
4. `legalChoicesDiscover` passes `shouldEvaluateOptionLegality: false` — **confirmed**, so `legalChoicesDiscover` would NOT hit the validation error, but would still re-discover decisions for already-resolved SAs (incorrect but non-crashing).
5. `CompoundDecisionPath` type and `decisionPath` field on `ChoicePendingRequestBase` — **confirmed present** in `types-core.ts`.
6. `resolveMoveDecisionSequence` routes SA decisions to `move.compound.specialActivity.params` via `decisionPath` — **confirmed present** in `move-decision-sequence.ts`.
7. 15 compound SA unit tests in `legal-choices-compound.test.ts` — **confirmed present**, but they test partial moves (SA params not yet filled), not fully-resolved compound moves.

## Architecture Check

1. **Game-agnostic**: All changes are in the kernel's generic `legalChoices*` machinery. No game-specific identifiers, branches, or rule handlers are introduced. The fix handles compound moves generically — any game with compound actions benefits.
2. **Cleaner than alternatives**: The SA completeness check adds a missing invariant: "don't re-discover what's already resolved." The state-correctness fix addresses a fundamental semantic error — SA decisions must be evaluated against a state that reflects the main action's effects, or must skip validation for pre-filled params.
3. **No backwards-compatibility shims**: The current broken behavior has no dependents. The fix restores the pre-014 contract that fully-specified moves evaluate to `complete`.

### Design Options for Flaw 2 (State Correctness)

| Approach | Pros | Cons |
|----------|------|------|
| A: Skip SA chaining when SA params are fully resolved | Simple, correct for replay/validation | MCTS discovery still uses wrong state for partially-filled SAs |
| B: Run main action effects to produce post-op state, use for SA | Semantically correct state for SA | Expensive (full effect execution), complex error handling, side effects |
| C: Disable option legality validation for SA chaining | Simple, non-crashing | Loses validation — illegal SA selections pass silently |
| D: Check SA completeness first (Flaw 1 fix), then for partial SAs use `shouldEvaluateOptionLegality: false` | Correct for fully-specified, non-crashing for partial, MCTS handles via `applyMove` failures | SA option validation is weaker than main action validation |

**Recommendation**: Approach D — fix Flaw 1 (SA completeness check), and for the remaining partial-SA-discovery case, use `shouldEvaluateOptionLegality: false`. This is correct because:
- Fully-resolved compound moves return `complete` immediately (no re-discovery)
- Partial SAs (MCTS incremental expansion) get discovery without validation, which is fine — MCTS already handles `applyMove` failures gracefully
- No expensive effect execution needed
- Preserves the 014 architecture for MCTS compound SA decision expansion

## What to Change

### 1. Add SA completeness check in `maybeChainCompoundSA`

Before chaining into SA discovery, check whether the SA's params already satisfy all required decisions. If the SA sub-move's `legalChoicesWithPreparedContextStrict` returns `complete`, skip discovery and return `complete` for the whole compound move.

The simplest completeness heuristic: call `legalChoicesWithPreparedContextStrict` for the SA **without option legality validation** (`shouldEvaluateOptionLegality: false`). If it returns `complete`, the SA is already resolved — return `complete` for the compound move. If it returns `pending`, chain into normal SA discovery (also without option legality validation, per Flaw 2 fix).

### 2. Disable option legality validation for SA discovery

In `discoverCompoundSAChoices`, always pass `shouldEvaluateOptionLegality: false` to the SA's `legalChoicesWithPreparedContextStrict` call. The pre-main-op state is not reliable for validating SA selections. `applyMove` will catch truly illegal selections when the compound move is executed against the accumulated state.

### 3. Add regression tests for fully-resolved compound moves

Add unit tests that pass fully-specified compound moves through `legalChoicesEvaluate` and verify they return `complete` without errors.

### 4. Verify golden test recovery

The FITL playbook golden test must return to 9/9 pass after the fix.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify — `maybeChainCompoundSA`, `discoverCompoundSAChoices`)
- `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` (modify — add fully-resolved compound move tests)

## Out of Scope

- MCTS E2E validation and `acceptableCategories` tuning (63MCTSRUNMOVCLA-007 — blocked on this)
- Post-main-op state computation for SA discovery (Approach B — future optimization if needed)
- Changes to `CompoundDecisionPath` type or `resolveMoveDecisionSequence` routing
- Changes to `decision-expansion.ts` MCTS compound SA handling
- Runner or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-playbook-golden.test.ts` — 9/9 subtests pass (regression recovery).
2. `legal-choices-compound.test.ts` — existing 15 tests pass (no regression in partial compound flow).
3. New test: `legalChoicesEvaluate` with fully-resolved compound move → returns `complete`.
4. New test: `legalChoicesDiscover` with fully-resolved compound move → returns `complete`.
5. New test: `legalChoicesEvaluate` with partially-resolved compound SA → returns `pending` with SA decision.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalChoicesEvaluate` on a fully-specified compound move returns `complete` (never re-discovers resolved decisions).
2. SA discovery never validates selections against pre-main-op state (no false "outside options domain" errors).
3. Kernel remains game-agnostic — no game-specific branches.
4. No backwards-compatibility shims.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` — add tests for fully-resolved compound moves through `legalChoicesEvaluate` and `legalChoicesDiscover`

### Commands

1. `node --test dist/test/e2e/fitl-playbook-golden.test.js` (regression recovery)
2. `node --test dist/test/unit/kernel/legal-choices-compound.test.js` (targeted)
3. `pnpm -F @ludoforge/engine test` (full suite)
