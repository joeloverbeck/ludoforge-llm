# FITLEVENT-025: Harden Card-25 Mekong Targeting Selector Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — GameSpecDoc data/test hardening only
**Deps**: specs/29-fitl-event-card-encoding.md

## Problem

Card-25 currently identifies the intended 3 Mekong river LoCs using a data heuristic (`econ < 2`) coupled with `terrainTags includes mekong`. This is brittle and can silently break if map economics are revised.

## Assumption Reassessment (2026-03-04)

1. Verified card-25 selectors currently use `category=loc` + `terrainTags includes mekong` + `econ < 2`.
2. Verified this excludes `loc-saigon-can-tho:none` today, but only implicitly via econ value.
3. Mismatch: event intent is spatial (“3 river LoCs touching Can Tho”), not economic. Corrected scope is selector hardening to spatial semantics.

## Architecture Check

1. Spatially explicit selectors are cleaner and more extensible than incidental numeric heuristics.
2. Keeps game-specific map semantics in GameSpecDoc data, not GameDef/runtime code.
3. No backwards-compatibility layer; direct replacement of fragile selector pattern.

## What to Change

### 1. Replace heuristic Mekong LoC filter

Encode card-25 Mekong LoC scope using a spatially explicit predicate (for example, LoC + mekong + adjacency to `can-tho:none` and excluding the Saigon route by rule-consistent structural criteria).

### 2. Add selector-regression tests

Assert that exactly the intended LoCs are targeted by card-25 effects/grants regardless of econ adjustments.

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

1. `packages/engine/test/integration/fitl-events-tf-116-riverines.test.ts` — add exact-target-set assertions independent of econ heuristic.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tf-116-riverines.test.js`
3. `pnpm -F @ludoforge/engine test`
