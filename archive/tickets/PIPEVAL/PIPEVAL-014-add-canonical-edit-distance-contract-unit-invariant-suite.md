# PIPEVAL-014: Add canonical edit-distance contract unit invariant suite

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract unit tests for canonical utility
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-010-consolidate-edit-distance-contract-utility.md`

## Problem

`edit-distance-contract.ts` is now the canonical owner of ranking primitives, but algorithmic invariants were only tested indirectly through consumer modules (plus ownership lint guards). Missing direct behavior tests weakens failure localization and makes future refactors riskier.

## Assumption Reassessment (2026-03-05)

1. `packages/engine/src/contracts/edit-distance-contract.ts` exports `levenshteinDistance`, `compareByDistanceThenLex`, and `rankByEditDistance`.
2. No dedicated behavioral unit test file currently targets this canonical module directly.
3. A direct lint/source-guard test already exists (`packages/engine/test/unit/lint/contracts-edit-distance-source-guard.test.ts`) and verifies ownership/import boundaries, but it does not verify algorithmic behavior.
4. Existing consumer contract tests (`missing-reference-diagnostic-contract` and `binding-identifier-contract`) exercise ranking behavior indirectly, but they do not fully lock canonical utility invariants at the module boundary.

## Architecture Check

1. Testing canonical modules directly is cleaner than relying only on downstream behavior because ownership boundaries become explicit and regressions localize immediately.
2. This ticket adds test coverage only; no game-specific behavior is introduced into agnostic layers.
3. No backwards-compatibility aliases or shims are introduced.

## What to Change

### 1. Add direct unit coverage for edit-distance invariants

Create dedicated tests for identity, insertion/deletion/substitution behavior, deterministic tie ordering, ranking output shape, and non-mutation of input candidates.

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
3. Ranking helper does not mutate caller-provided candidate arrays.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` — direct invariant tests for algorithm + ranking determinism.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/contracts/edit-distance-contract.test.js`
3. `pnpm turbo test --force`

## Outcome

- Completion date: 2026-03-05
- Outcome amended: 2026-03-05
- What changed:
  - Added `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` with direct invariants for:
    - Levenshtein identity/insertion/deletion/substitution behavior
    - Comparator ordering by distance then lexicographic candidate name
    - `rankByEditDistance` deterministic tie ordering and scored output shape
    - Non-mutation of caller-provided candidate arrays
  - Hardened `packages/engine/src/contracts/edit-distance-contract.ts` tie-break ordering to use locale-independent UTF-16 code-unit lexicographic comparison instead of `localeCompare`, preserving deterministic behavior across runtime locales.
  - Expanded `packages/engine/test/unit/contracts/edit-distance-contract.test.ts` with a non-ASCII tie-case (`['ä', 'z']`) to lock locale-independent ordering.
  - Reassessed and corrected assumptions/scope before implementation to account for existing source-guard coverage and indirect consumer tests.
- Deviations from original plan:
  - Runtime contract source was updated post-archive to remove locale-dependent comparator behavior and improve cross-environment determinism.
  - Added explicit non-mutation invariant coverage because it is an important robustness contract not previously stated.
- Verification results:
  - `pnpm turbo build` passed
  - `node --test packages/engine/dist/test/unit/contracts/edit-distance-contract.test.js` passed
  - `pnpm turbo test --force` passed
  - `pnpm turbo lint` passed
