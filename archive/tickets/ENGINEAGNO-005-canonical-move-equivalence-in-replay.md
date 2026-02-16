# ENGINEAGNO-005: Canonical Move Equivalence for Game-Agnostic Replay

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — game-agnostic move comparison utility and replay integration
**Deps**: ENGINEAGNO-004

## Problem

Current replay matching in `test/helpers/replay-harness.ts` uses `JSON.stringify(move.params)` for exact matching. `test/e2e/texas-holdem-real-plays.test.ts` also duplicates this exact comparison in `hasExactMove`.

These comparisons are sensitive to object key insertion order, so semantically equivalent params can be rejected.

This violates robust, deterministic, game-agnostic replay expectations and pushes brittle behavior into test infrastructure that should be reusable across arbitrary `GameSpecDoc` games.

## What to Change

1. Introduce a canonical, game-agnostic move-equivalence utility in shared kernel code (not test-suite-local, not Texas-specific).
2. Canonicalize object-valued params with stable key ordering before equality checks.
3. Keep array order semantics unchanged (array order remains meaningful).
4. Update replay harness matching to use canonical move equivalence.
5. Replace any duplicate exact-move comparisons in tests (including Texas real-play helper) to use the shared utility.
6. Remove/replace tests that currently encode key-order brittleness as expected behavior.

## Invariants

1. Semantically equivalent moves compare equal regardless of object key insertion order.
2. Replay exact-match mode remains strict for value semantics (same action + semantically equal params).
3. Array parameter order remains strict and deterministic.
4. Utility remains fully game-agnostic and reusable across games.

## Tests

1. Unit: canonical comparator treats `{a:1,b:2}` and `{b:2,a:1}` as equal.
2. Unit: comparator preserves array-order sensitivity (`[1,2]` != `[2,1]`).
3. Unit: replay harness exact mode accepts semantically equivalent param key orders.
4. Unit/E2E helper regression: exact-move listing helper path uses shared comparator (no duplicate stringify logic).
5. Regression: replay harness illegal-step diagnostics still fail correctly for truly illegal moves.

## Outcome

- **Completion date**: 2026-02-16
- **What changed**:
  - Added shared kernel utility `src/kernel/move-equivalence.ts` with canonical param comparison helpers (`canonicalMoveParamsKey`, `areMoveParamsEquivalent`, `areMovesEquivalent`) and exported it via `src/kernel/index.ts`.
  - Updated `test/helpers/replay-harness.ts` exact-move matching key generation to use the shared canonical comparator key.
  - Updated `test/e2e/texas-holdem-real-plays.test.ts` helper `hasExactMove` to use `areMovesEquivalent`, removing duplicate stringify-based comparison.
  - Replaced replay harness unit behavior that previously encoded key-order brittleness; exact mode now accepts semantically equivalent key orders.
  - Added new unit coverage in `test/unit/move-equivalence.test.ts`.
- **Deviations from original plan**:
  - During implementation it was confirmed that `Move.params` contract allows top-level object params with scalar/array-of-scalar values (no nested object params), so tests were aligned to the real type contract while preserving key-order and array-order invariants.
- **Verification results**:
  - `npm run lint` passed.
  - `npm test` passed.
  - Targeted validations also passed:
    - `node --test dist/test/unit/replay-harness.test.js dist/test/unit/move-equivalence.test.js`
    - `node --test dist/test/e2e/texas-holdem-real-plays.test.js`
