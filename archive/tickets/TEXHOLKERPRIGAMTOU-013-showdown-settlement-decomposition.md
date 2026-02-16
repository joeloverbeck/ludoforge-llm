# TEXHOLKERPRIGAMTOU-013: Showdown Settlement Decomposition + Pot Distribution Properties

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-012
**Blocks**: None

## 0) Assumption Reassessment (Current Code/Test Reality)

Corrected assumptions after inspecting current code/tests:
- Settlement is already partially bifurcated logically, but only inside one macro: `side-pot-distribution` currently contains:
  - an inline uncontested branch (single live hand)
  - contested side-pot layering and odd-chip logic
- The `showdown` phase currently calls only `side-pot-distribution`; it does not expose explicit path-level contracts.
- Existing integration tests already cover several invariants:
  - chip conservation and non-negative stacks across deterministic transitions
  - side-pot eligibility bounds in forced all-in scenarios
- Missing coverage/gaps:
  - explicit assertion that showdown chooses exactly one settlement path
  - direct contract-level checks for new settlement macro boundaries
  - focused odd-chip determinism checks per path boundary

Architecture decision for this ticket:
- **Do add** explicit settlement contracts:
  - `award-uncontested-pot`
  - `distribute-contested-pots`
- **Do update** showdown `onEnter` to select exactly one settlement path.
- **Do not** add engine/runtime special cases; keep settlement game-authored in GameSpec YAML.

## Problem

Settlement still lives in one mixed macro contract, making reasoning, regression isolation, and cross-game reuse harder than necessary.

## 1) What should be added/changed

1. Decompose settlement into two explicit macros/contracts:
- `award-uncontested-pot`
- `distribute-contested-pots`
2. Update `showdown` path selection to choose exactly one contract per hand:
- uncontested hand occupancy => `award-uncontested-pot`
- otherwise => `distribute-contested-pots`
3. Preserve/normalize odd-chip and eligibility behavior under both paths.
4. Update tests to validate settlement decomposition boundaries and path-selection behavior.

## 2) Invariants that must pass

1. Uncontested path: exactly one winner receives entire `pot` once.
2. Contested path: total distributed chips exactly equals pre-showdown pot.
3. No side-pot layer pays ineligible players.
4. `pot == 0` after settlement and no negative stacks.
5. `showdown` executes exactly one settlement macro path per hand.

## 3) Tests that must pass

1. New/updated structure tests asserting settlement macro decomposition and showdown path routing.
2. New focused integration/property-style tests over multi-seed runs asserting:
- uncontested path payout behavior
- contested side-pot payout conservation + eligibility constraints
3. Regression tests for odd-chip deterministic allocation consistency.
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Corrected assumptions before implementation: the prior architecture already had inline bifurcation inside `side-pot-distribution`, and several conservation/eligibility invariants were already covered by existing integration tests.
  - Decomposed settlement into explicit contracts in Texas GameSpec YAML:
    - `award-uncontested-pot`
    - `distribute-contested-pots`
  - Updated showdown logic to choose exactly one settlement path.
  - Updated spec and tests to reflect and verify the decomposition and route selection.
  - Added deterministic contested odd-chip regression coverage in integration tests.
- **Deviations from original plan**:
  - No kernel/runtime/compiler changes were needed; this remained a pure GameSpec+test refactor, which is cleaner and more extensible than adding engine-level settlement branches.
  - Existing broad invariants were retained and complemented with focused path-routing and odd-chip determinism checks rather than duplicating already-covered properties.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
