# 62MCTSSEAVIS-015: Verify legalChoicesDiscover() Illegal Path Handling

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Possibly — kernel/legal-choices.ts
**Deps**: 62MCTSSEAVIS-008

## Problem

When a decision path leads to an impossible state (empty domain — no legal options), `legalChoicesDiscover()` must return `illegal` so the MCTS can prune and backpropagate. This ticket verifies edge cases.

## What to Change

### 1. Write tests for illegal/impossible decision paths

- Decision where all options are eliminated by constraints → `illegal`
- Decision where zone has no tokens → `illegal`
- Decision where player has no resources → `illegal`
- Decision where stacking caps prevent placement → `illegal`

### 2. Fix if needed

If any edge case returns `pending` with empty options instead of `illegal`, fix `legalChoicesDiscover()`.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify if fix needed)
- `packages/engine/test/unit/kernel/legal-choices-illegal.test.ts` (new)

## Out of Scope

- Compound move handling (62MCTSSEAVIS-014)
- Decision expansion module (62MCTSSEAVIS-008)
- Changes to move types
- Non-edge-case behavior (well-tested already)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: empty domain returns `illegal`, not `pending` with empty options
2. Unit test: zone with no matching tokens returns `illegal`
3. Unit test: impossible constraint combination returns `illegal`
4. Unit test: `illegal` result includes descriptive reason string
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `illegal` is returned whenever no legal choices exist — never `pending` with `[]` options
2. All other `legalChoicesDiscover()` behavior unchanged
3. `illegal` result includes enough info for diagnostic logging

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices-illegal.test.ts` — edge cases for impossible states

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern legal-choices`
2. `pnpm turbo build && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - Added `'emptyDomain'` as a new `DiscoveryIllegalReason` in `legality-reasons.ts`, extending the `ChoiceIllegalReason` union.
  - Added `coerceEmptyDomainToIllegal()` guard in `legal-choices.ts` — converts `pending` with empty options to `illegal` with reason `'emptyDomain'` at all 3 public API boundaries. A `chooseN` with `canConfirm === true` (min=0) correctly passes through unchanged.
  - Created `legal-choices-illegal.test.ts` with 6 tests (empty enum param, empty zone chooseOne, empty chooseN min>0, reason string, chooseN min=0 remains pending, legalChoicesEvaluate coverage).
  - Updated 5 existing test files whose expectations changed from `pending` with `[]` options to `illegal` with `emptyDomain`.
- **Deviations**: Stacking cap and resource edge cases were already handled by existing `STACKING_VIOLATION` / pipeline cost validation paths — no new code needed for those. The `emptyDomain` reason was added as a new `DiscoveryIllegalReason` (not a `KernelLegalityOutcome`) to avoid requiring `LEGALITY_OUTCOME_PROJECTIONS` entries.
- **Verification**: `pnpm turbo build` passes, `pnpm turbo typecheck` passes, `pnpm -F @ludoforge/engine test` — 4943 tests pass, 0 failures.
