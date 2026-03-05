# PIPEVAL-014: Add canonical edit-distance contract unit invariant suite

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract unit tests for canonical utility
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-010-consolidate-edit-distance-contract-utility.md`

## Problem

`edit-distance-contract.ts` is now the canonical owner of ranking primitives, but invariants are only tested indirectly through consumer modules. Missing direct tests weakens failure localization and makes future refactors riskier.

## Assumption Reassessment (2026-03-05)

1. `packages/engine/src/contracts/edit-distance-contract.ts` exports `levenshteinDistance`, `compareByDistanceThenLex`, and `rankByEditDistance`.
2. No dedicated unit test file currently targets this canonical module directly.
3. Existing consumer tests verify behavior at integration points, but do not guarantee utility-level invariants independently.

## Architecture Check

1. Testing canonical modules directly is cleaner than relying only on downstream behavior because ownership boundaries become explicit and regressions localize immediately.
2. This ticket adds test coverage only; no game-specific behavior is introduced into agnostic layers.
3. No backwards-compatibility aliases or shims are introduced.

## What to Change

### 1. Add direct unit coverage for edit-distance invariants

Create dedicated tests for identity, insertion/deletion/substitution behavior, deterministic tie ordering, and ranking output shape.

### 2. Protect deterministic sorting contract

Add tests that lock lexicographic tie-break behavior so all suggestion consumers inherit deterministic ordering.

## Files to Touch

- `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` (new)

## Out of Scope

- Consumer API changes
- Threshold/limit policy changes in consumer modules
- GameSpecDoc/visual-config/runtime behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Canonical utility tests prove expected Levenshtein outputs for representative cases.
2. Canonical utility tests prove deterministic ranking/tie-break ordering.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Canonical utility contract is explicitly verified at module boundary.
2. Deterministic ranking behavior remains stable for all consumers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` — direct invariant tests for algorithm + ranking determinism.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/contracts/edit-distance-contract.test.js`
3. `pnpm turbo test --force`
