# FITLEVENT-025: Harden Card-25 Mekong Targeting Selector Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — GameSpecDoc data/test hardening only
**Deps**: specs/29-fitl-event-card-encoding.md

## Problem

Card-25 currently identifies the intended 3 Mekong river LoCs using a data heuristic (`econ < 2`) coupled with `terrainTags includes mekong`. This is brittle and can silently break if map economics are revised.

## Assumption Reassessment (2026-03-04)

1. Verified card-25 selectors currently use `category=loc` + `terrainTags includes mekong` + `econ < 2`.
2. Verified this excludes `loc-saigon-can-tho:none` today, but only implicitly via econ value.
3. Discrepancy in prior scope wording: "adjacent to Can Tho + structural exclusion" is not a stable contract and can remain ambiguous.
4. Corrected scope: encode an explicit target-set contract using concrete zone IDs for card-25 (`loc-can-tho-chau-doc:none`, `loc-can-tho-bac-lieu:none`, `loc-can-tho-long-phu:none`) across all unshaded/shaded selectors.

## Architecture Check

1. Spatially explicit selectors are cleaner and more extensible than incidental numeric heuristics.
2. Keeps game-specific map semantics in GameSpecDoc data, not GameDef/runtime code.
3. Exact ID contract is stronger than adjacency/econ-derived inference for a fixed historical card scope.
4. No backwards-compatibility layer; direct replacement of fragile selector pattern.

## What to Change

### 1. Replace heuristic Mekong LoC filter

Replace every card-25 `econ < 2` Mekong-LoC selector with an explicit zone-ID predicate matching exactly:

- `loc-can-tho-chau-doc:none`
- `loc-can-tho-bac-lieu:none`
- `loc-can-tho-long-phu:none`

### 2. Add selector-regression tests

Strengthen `fitl-events-tf-116-riverines` coverage to assert exact target-set behavior remains correct if LoC econ values are changed.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-tf-116-riverines.test.ts` (modify)

## Out of Scope

- Changing map asset econ values.
- Non-card-25 event targeting refactors.

## Acceptance Criteria

### Tests That Must Pass

1. Card-25 unshaded and shaded affect exactly intended Mekong LoCs via explicit spatial selector contract.
2. Card-25 tests fail if a non-target Mekong LoC (for example `loc-saigon-can-tho:none`) is accidentally included.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card targeting rules remain encoded in GameSpecDoc event data.
2. Engine/runtime remains fully game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tf-116-riverines.test.ts` — keep exact-target-set assertions and add econ-invariance regression coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tf-116-riverines.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-04
- What changed:
  - Replaced card-25 selector logic in `41-content-event-decks.md` from Mekong + `econ < 2` heuristics to an explicit three-zone ID contract (`loc-can-tho-chau-doc:none`, `loc-can-tho-bac-lieu:none`, `loc-can-tho-long-phu:none`) across unshaded grants and both unshaded/shaded effects.
  - Strengthened `fitl-events-tf-116-riverines` integration coverage with econ-invariance regression assertions that prove `loc-saigon-can-tho:none` remains out-of-scope even if econ values change.
- Deviations from original plan:
  - Scope wording was tightened before implementation: replaced ambiguous "adjacent + structural exclusion" intent with exact zone-ID contract to eliminate interpretation drift.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-tf-116-riverines.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
