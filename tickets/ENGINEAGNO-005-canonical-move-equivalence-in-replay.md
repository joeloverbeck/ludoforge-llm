# ENGINEAGNO-005: Canonical Move Equivalence for Game-Agnostic Replay

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — game-agnostic move comparison utility and replay integration
**Deps**: ENGINEAGNO-004

## Problem

Current replay matching in `test/helpers/replay-harness.ts` uses `JSON.stringify(move.params)` for exact matching. This makes replay legality checks sensitive to object key insertion order, so semantically equivalent params can be rejected.

This violates robust, deterministic, game-agnostic replay expectations and pushes brittle behavior into test infrastructure that should be reusable across arbitrary `GameSpecDoc` games.

## What to Change

1. Introduce a canonical, game-agnostic move-equivalence utility (shared location, not Texas-specific).
2. Canonicalize object-valued params with stable key ordering before equality checks.
3. Keep array order semantics unchanged (array order remains meaningful).
4. Update replay harness matching to use canonical move equivalence.
5. Remove/replace tests that currently encode key-order brittleness as expected behavior.

## Invariants

1. Semantically equivalent moves compare equal regardless of object key insertion order.
2. Replay exact-match mode remains strict for value semantics (same action + semantically equal params).
3. Array parameter order remains strict and deterministic.
4. Utility remains fully game-agnostic and reusable across games.

## Tests

1. Unit: canonical comparator treats `{a:1,b:2}` and `{b:2,a:1}` as equal.
2. Unit: comparator preserves array-order sensitivity (`[1,2]` != `[2,1]`).
3. Unit: replay harness exact mode accepts semantically equivalent param key orders.
4. Regression: replay harness illegal-step diagnostics still fail correctly for truly illegal moves.
