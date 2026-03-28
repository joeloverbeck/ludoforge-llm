# 88PHAAWAACTFIL-003: Phase-action-index unit tests and enumeration parity tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test files
**Deps**: archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-001.md, tickets/88PHAAWAACTFIL-002.md

## Problem

The phase-action-index (ticket 001) and its integration into `enumerateRawLegalMoves` (ticket 002) need dedicated tests to prove correctness: that the index groups actions correctly, that cache works, and that the narrowed enumeration produces identical legal moves as the original full iteration would.

## Assumption Reassessment (2026-03-28)

1. Engine tests use Node.js built-in test runner (`node --test`), not Vitest — confirmed from CLAUDE.md.
2. Existing legal-moves tests are at `packages/engine/test/unit/kernel/legal-moves.test.ts` — confirmed via grep.
3. FITL has 45 actions across 7 phases — stated in spec, verifiable at test time by compiling the FITL production spec.
4. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` is the canonical way to compile FITL for testing — confirmed from CLAUDE.md.
5. No `classified-move-parity` test exists yet — grep returned no matches. This is a new test to be created.

## Architecture Check

1. Index unit tests are in a new file under `test/unit/kernel/` — standard location matching existing patterns.
2. Parity test compiles FITL production spec and verifies that the phase-filtered enumeration produces the same legal moves as iterating all actions — this is a behavioral equivalence proof, not a performance test.
3. No game-specific logic in the kernel — the parity test uses FITL as a data fixture only.

## What to Change

### 1. Create `packages/engine/test/unit/kernel/phase-action-index.test.ts`

Unit tests for the index builder and cache:

- **Correct grouping**: Given a synthetic `GameDef` with actions spanning known phases, assert that `getPhaseActionIndex` returns the correct actions per phase.
- **Dual-phase actions**: An action with `phase: ['a', 'b']` must appear in both buckets.
- **Empty phase lookup**: Querying a phase not in any action's array returns `undefined` (no bucket).
- **Cache identity**: Calling `getPhaseActionIndex` twice with the same `def` returns the same object reference (WeakMap cache hit).
- **Different defs**: Two different `GameDef` objects get independent indexes.

### 2. Create `packages/engine/test/unit/kernel/phase-action-index-parity.test.ts`

Enumeration parity test using FITL production spec:

- Compile FITL via `compileProductionSpec()`.
- For each phase in `def.turnStructure.phases`, create a state with that phase as `currentPhase`.
- Call `enumerateRawLegalMoves` (which now uses the phase index).
- Independently filter `def.actions` by `action.phase.includes(phaseId)` and verify that the index's bucket contains exactly those actions.
- This proves the index is correct for the real FITL game definition.

### 3. FITL action distribution assertion

Within the parity test, assert the spec's expected distribution:
- Total actions: 45.
- At least 2 actions span multiple phases (dual-phase actions).
- Every action appears in at least one phase bucket (no orphans — compiler guarantees this).

## Files to Touch

- `packages/engine/test/unit/kernel/phase-action-index.test.ts` (new)
- `packages/engine/test/unit/kernel/phase-action-index-parity.test.ts` (new)

## Out of Scope

- Modifying `phase-action-index.ts` — implementation is ticket 001.
- Modifying `legal-moves.ts` — integration is ticket 002.
- Performance benchmarks or timing assertions.
- Tests for `action-applicability-preflight.ts` — that module is unchanged.
- Any compiler, CNL, or runner changes.
- E2E simulation tests (existing E2E tests already cover end-to-end correctness).

## Acceptance Criteria

### Tests That Must Pass

1. `node --test packages/engine/test/unit/kernel/phase-action-index.test.ts` — all index unit tests pass.
2. `node --test packages/engine/test/unit/kernel/phase-action-index-parity.test.ts` — FITL parity test passes.
3. `pnpm turbo test` — full test suite passes including new tests.
4. `pnpm turbo typecheck` — test files compile cleanly.
5. `pnpm turbo lint` — test files pass linting.

### Invariants

1. Index unit tests use synthetic `GameDef` stubs — no dependency on FITL data for core logic tests.
2. Parity test uses `compileProductionSpec()` — no separate fixture files for FITL (per CLAUDE.md testing requirements).
3. No game-specific logic in the index module is tested — tests verify the generic phase-grouping behavior.
4. The parity test is a behavioral equivalence check, NOT a performance assertion.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/phase-action-index.test.ts` — index builder correctness, cache behavior, edge cases.
2. `packages/engine/test/unit/kernel/phase-action-index-parity.test.ts` — FITL production spec parity verification.

### Commands

1. `pnpm turbo build` (engine must be built before running node --test)
2. `node --test packages/engine/test/unit/kernel/phase-action-index.test.ts`
3. `node --test packages/engine/test/unit/kernel/phase-action-index-parity.test.ts`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`
