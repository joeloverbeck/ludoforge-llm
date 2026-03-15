# 63CHOOPEROPT-002: Refactor mapChooseNOptions into strategy dispatcher

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal-choices.ts
**Deps**: 63CHOOPEROPT-001

## Problem

`mapChooseNOptions()` is a monolithic function that either enumerates all C(n,k) combinations or bails out to all-unknown. It needs to become a strategy dispatcher that routes to the appropriate resolution path based on domain size.

## Assumption Reassessment (2026-03-15)

1. `mapChooseNOptions()` is in `legal-choices.ts` lines ~236-399. It uses `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024` as a hard cap.
2. `countCombinationsCapped()` and `enumerateCombinations()` are local helpers in the same file.
3. When cap is exceeded, ALL options are returned as `unknown` — the blanket fallback that must be removed.

## Architecture Check

1. The current exhaustive enumerator is preserved as the small-case exact path AND as a test oracle.
2. The strategy dispatcher is a pure refactor of the existing monolithic function — same inputs, same outputs, different internal routing.
3. No game-specific logic. Generic kernel optimization.

## What to Change

### 1. Rename the cap constant

Rename `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS` to `MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS` to clarify its narrowed purpose.

### 2. Extract the exhaustive enumerator

Move the current combination-enumeration logic into a named helper (e.g., `resolveChooseNOptionsExhaustive()`). This helper is called when the combination count is at or below the threshold.

### 3. Create the strategy dispatcher

Replace the monolithic `mapChooseNOptions()` body with:
```
1. Count combinations
2. If within exact threshold → resolveChooseNOptionsExhaustive()
3. Else → return options with resolution: 'provisional' (placeholder for hybrid path)
```

The hybrid path (singleton probe + witness search) is NOT implemented here — it returns provisional results as a safe intermediate state. This ensures the all-unknown blanket fallback is removed immediately.

### 4. Add budget constants

Add (but don't yet consume):
- `MAX_CHOOSE_N_TOTAL_PROBE_BUDGET`
- `MAX_CHOOSE_N_TOTAL_WITNESS_NODES`

These are count-based, not time-based.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)

## Out of Scope

- Singleton probe pass (63CHOOPEROPT-003)
- Witness search algorithm (63CHOOPEROPT-004)
- New file `choose-n-option-resolution.ts` (created in 63CHOOPEROPT-003/004)
- Worker-local session (Phase B)
- `advance-choose-n.ts` changes
- `effects-choice.ts` changes (already done in 001)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: domains below `MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS` produce identical results to the old exhaustive path (oracle parity)
2. New unit test: domains above the threshold produce per-option `unknown` with `resolution: 'provisional'` (NOT blanket identical — each option individually marked)
3. New unit test: static filtering (already-selected, at-capacity, tier-blocked) still produces `illegal` + `resolution: 'exact'` regardless of domain size
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Small-domain exact parity: identical `legality` and `resolution` as before for domains within the threshold.
2. No blanket all-unknown fallback — large domains return a mixed surface where statically-resolved options keep their exact result.
3. `countCombinationsCapped()` and `enumerateCombinations()` are preserved (not deleted).
4. Deterministic: no wall-clock cutoffs, no randomness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-strategy-dispatch.test.ts` — strategy routing, oracle parity, large-domain fallback behavior
2. Modify `packages/engine/test/unit/kernel/legal-choices.test.ts` — verify existing chooseN tests still pass with the refactored dispatcher

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
