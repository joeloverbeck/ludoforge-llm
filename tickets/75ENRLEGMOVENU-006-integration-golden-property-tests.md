# 75ENRLEGMOVENU-006: Integration, Golden, and Property Tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test files only, no production code
**Deps**: 75ENRLEGMOVENU-001 through 005 (all production changes complete)

## Problem

Spec 75 changes the core `legalMoves` → agent → `applyMove` pipeline. While individual tickets include unit tests, this ticket adds the cross-cutting integration, golden, and property tests that verify end-to-end correctness and determinism.

## Assumption Reassessment (2026-03-22)

1. FITL golden tests exist under `packages/engine/test/e2e/` and `test/integration/` — they exercise full compile → run pipelines.
2. Texas Hold'em golden tests also exist — they exercise the same pipeline with a different game.
3. Determinism tests exist — they verify same seed + same actions = identical state hash.
4. Property tests may exist for random play stability — verify no crashes for N turns.
5. `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts` is used for FITL compilation in tests.

## Architecture Check

1. These tests verify that Spec 75 is a pure refactoring — behavior is identical, only performance changes.
2. Golden tests must produce bit-identical output — `ClassifiedMove` wrapping must not alter `Move` objects.
3. Determinism tests verify Foundation 5 is preserved across the pipeline change.

## What to Change

### 1. Determinism Parity Tests

Add or extend determinism tests that:
- Run the same game (FITL, Texas Hold'em) with the same seed twice
- Verify identical final state hash
- This proves that classification + skipMoveValidation don't alter outcomes

### 2. FITL Golden Test Verification

- Run existing FITL golden tests — they must pass without any golden file updates.
- If any golden file needs updating, that indicates a behavioral regression (bug).

### 3. Texas Hold'em Golden Test Verification

- Same as FITL — existing golden tests must pass unchanged.

### 4. Property Tests

Add property tests that:
- For every `ClassifiedMove` returned by `enumerateLegalMoves`, `viability.viable === true`
- For every `ClassifiedMove` with `viability.complete === true`, `applyMove(def, state, cm.move)` succeeds
- `applyMove` with `skipMoveValidation: true` produces the same `ApplyMoveResult` as without for every legal move
- Random play for N turns produces no crashes, no invalid state, no token duplication (existing property test pattern)

### 5. skipMoveValidation Parity Test

Run a full Texas Hold'em simulation with `skipMoveValidation: true` and without — compare traces. They must be identical.

## Files to Touch

- `packages/engine/test/integration/classified-move-parity.test.ts` (new — determinism + skipMoveValidation parity)
- `packages/engine/test/unit/kernel/legal-moves-property.test.ts` (new or extend — ClassifiedMove property tests)
- Existing FITL and Texas Hold'em golden/e2e tests (verify pass — no modifications expected)

## Out of Scope

- Production code changes — this ticket is tests only
- Performance benchmarking — that's a separate concern (can be a follow-up)
- Runner integration tests — runner changes are type-only and covered by typecheck
- Modifying any golden files — if they need updating, it's a regression to investigate

## Acceptance Criteria

### Tests That Must Pass

1. FITL determinism: same seed + same actions = identical state hash (existing test, must still pass)
2. Texas Hold'em determinism: same seed + same actions = identical state hash
3. FITL golden tests: all pass without golden file changes
4. Texas Hold'em golden tests: all pass without golden file changes
5. Property: every `ClassifiedMove` from `enumerateLegalMoves` has `viability.viable === true`
6. Property: every complete `ClassifiedMove` can be applied with `applyMove` successfully
7. Property: `skipMoveValidation: true` produces same `ApplyMoveResult` as full validation for every legal move in a 100-turn random game
8. Property: random play for 500 turns with `ClassifiedMove` pipeline produces no crashes
9. Existing suite: `pnpm turbo test` — full green
10. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. No golden files are modified — Spec 75 is a pure performance optimization with zero behavioral change.
2. Determinism is preserved across the entire pipeline (Foundation 5).
3. Both games (FITL, Texas Hold'em) exercise the same generic classification mechanism (Foundation 1).
4. All property tests are deterministic (seeded RNG) and reproducible.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/classified-move-parity.test.ts` — determinism parity, skipMoveValidation parity, both games
2. `packages/engine/test/unit/kernel/legal-moves-property.test.ts` — ClassifiedMove invariant properties

### Commands

1. `pnpm -F @ludoforge/engine test:all` — all engine tests including e2e
2. `pnpm turbo test` — full test suite
3. `pnpm turbo typecheck` — no type errors
4. `pnpm turbo lint` — no lint errors
