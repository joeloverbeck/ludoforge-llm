# TEXHOLKERPRIGAMTOU-013: Showdown Settlement Decomposition + Pot Distribution Properties

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-012
**Blocks**: None

## Problem

Showdown settlement currently combines uncontested and contested pot logic in one large macro, raising regression risk and reducing portability to other games.

## 1) What should be added/changed

1. Split settlement into two explicit macros/contracts:
- `award-uncontested-pot`
- `distribute-contested-pots`
2. Add clear hand-end path selection logic that chooses exactly one path.
3. Normalize odd-chip and eligibility resolution behavior under both paths.
4. Document settlement contracts in spec/tests for reuse in future card games.

## 2) Invariants that must pass

1. Uncontested path: exactly one winner receives entire `pot` once.
2. Contested path: total distributed chips exactly equals pre-showdown pot.
3. No side-pot layer pays ineligible players.
4. `pot == 0` after settlement and no negative stacks.

## 3) Tests that must pass

1. New focused integration tests for uncontested and contested settlement path selection.
2. New property tests over multi-seed runs asserting pot conservation and eligibility constraints.
3. Regression tests for odd-chip deterministic allocation.
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
