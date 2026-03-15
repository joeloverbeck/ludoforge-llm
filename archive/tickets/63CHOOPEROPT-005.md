# 63CHOOPEROPT-005: Selected-sequence validation and removal invalidation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-choice.ts, choose-n-option-resolution.ts
**Deps**: 63CHOOPEROPT-001, 63CHOOPEROPT-003

## Problem

When removing an early-tier selection, a later-tier selected item may become retroactively invalid (e.g., un-exhausting tier 0 re-locks tier 1). The current code handles this by rerunning the full pipeline, but the session-based path (Phase B) needs an extracted validator for the current selected sequence.

## Assumption Reassessment (2026-03-15)

1. `computeTierAdmissibility()` in `prioritized-tier-legality.ts` computes which values are admissible given current selections. It is not sufficient alone for validating an entire selected sequence — it only returns the currently-admissible domain, not whether each selected item was valid at its point of selection.
2. `buildChooseNPendingChoice()` in `effects-choice.ts` constructs the pending request including tier admissibility. The validation logic is interleaved with construction logic and needs extraction.
3. Spec 4.7 requires validating the current selected sequence itself, not only the remaining unselected options.

## Architecture Check

1. Extract a pure validator from the chooseN effect path. This validator takes a template + selected sequence and returns validity status per selected item.
2. This validator is reused by both the non-session path (current `advanceChooseN` remove handling) and the future session path (Phase B).
3. No game-specific logic. Pure kernel utility.

## What to Change

### 1. Extract `validateChooseNSelectedSequence()` from effects-choice.ts

Create a pure function that:
- Takes: normalized domain, tier metadata, qualifier mode, cardinality bounds, selected sequence
- For each item in selected sequence (in order):
  - Checks membership in the base domain
  - Checks tier admissibility at this point in the sequence
  - Checks qualifier constraints if applicable
- Returns: list of invalid items (if any) with reasons

### 2. Add interaction-effect test fixtures

Per spec 11.3, add explicit test cases for:
- Pairwise conflict: A and B cannot both be chosen
- Quota / category constraint: exact counts by qualifier
- Dependency: A requires one of {B, C}
- Removal invalidation: remove early-tier selection → later-tier selected item becomes invalid
- `byQualifier` tier unlocking and relocking

### 3. Wire validator into witness search pruning

The witness search (004) should use this validator to prune invalid intermediate selections early, rather than discovering invalidity only through full pipeline probing.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — extract validator)
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify — use validator for pruning)

## Out of Scope

- `advance-choose-n.ts` refactoring to use the new validator (that comes with Phase B session integration, 63CHOOPEROPT-009)
- Worker-local session creation (63CHOOPEROPT-008)
- `prioritized-tier-legality.ts` changes (reuse as-is; only extract from effects-choice)
- UI changes

## Acceptance Criteria

### Tests That Must Pass

1. New test: removal invalidation — select [tier0-A, tier0-B, tier0-C, tier1-D], remove tier0-A → validator reports tier1-D as invalid (tier 0 no longer exhausted)
2. New test: `byQualifier` tier relocking — select items that exhaust a qualifier group, then remove one → validator reports items from the next tier's same qualifier group as invalid
3. New test: valid sequence — all items in a properly-ordered selection pass validation
4. New test: duplicate detection — selecting the same item twice is reported as invalid
5. New test: out-of-domain item — item not in normalized domain is reported as invalid
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The validator is a pure function — no side effects, no state mutation.
2. Validation order matters: items are checked in sequence order because tier admissibility depends on prior selections.
3. The validator does NOT rerun the full discovery pipeline — it uses pre-extracted template data.
4. `computeTierAdmissibility()` behavior is unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-selected-validation.test.ts` — selected-sequence validation, removal invalidation, qualifier mode edge cases
2. Modify `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — witness search uses validator for pruning

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

**Completion date**: 2026-03-15

### What changed

- **New file**: `packages/engine/src/kernel/choose-n-selected-validation.ts` — pure `validateChooseNSelectedSequence()` returning invalid items with reasons (`out-of-domain`, `duplicate`, `tier-blocked`) instead of throwing.
- **Modified**: `packages/engine/src/kernel/effects-choice.ts` — refactored `validateChooseNSelectionSequence()` to delegate to the new pure validator internally (throwing wrapper preserved for backward compat).
- **Modified**: `packages/engine/src/kernel/choose-n-option-resolution.ts` — added `WitnessSearchTierContext` interface; `runWitnessSearch` and `witnessSearchForOption` accept optional `tierContext`; DFS `walk` validates selections against tier ordering before probing.
- **New test**: `packages/engine/test/unit/kernel/choose-n-selected-validation.test.ts` — 16 tests covering all 6 acceptance criteria.
- **Modified test**: `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — 2 new tests for tier-context pruning; fixed 2 pre-existing lint errors (unused variables).

### Deviations from original plan

- Validator placed in its own file (`choose-n-selected-validation.ts`) rather than kept inside `effects-choice.ts`, following project convention of many small files and avoiding circular import issues.
- Tier context threaded as optional parameter to `runWitnessSearch` rather than embedded in `ChoicePendingChooseNRequest` type — avoids polluting the public serialization type. Current `legal-choices.ts` call site passes `undefined`; the tier context is available for future Phase B session integration (ticket 009).

### Verification

- `pnpm -F @ludoforge/engine test`: 4699 tests pass, 0 fail
- `npx tsc --noEmit`: clean
- `pnpm -F @ludoforge/engine lint`: clean
