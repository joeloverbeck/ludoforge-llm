# ENGINEARCH-107: Free-Operation Denial Parity Matrix Hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Tests only — parity matrix architecture hardening across simulator-facing legality surfaces
**Deps**: tickets/ENGINEARCH-106-free-operation-denial-cause-mapping-exhaustiveness.md

## Problem

Free-operation denial parity behavior is currently correct but encoded as repeated single-cause tests. The current shape is harder to extend safely when denial taxonomy evolves, creating drift risk between parity intent and test maintenance.

## Assumption Reassessment (2026-02-27)

1. Parity scaffolding exists and is already used for legality-surface contract tests. Confirmed.
2. Prior assumption that parity only covered `actionIdMismatch` and `noActiveSeatGrant` was incorrect.
3. Current parity suite already covers `actionIdMismatch`, `noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, and `zoneFilterMismatch` in `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`.
4. `packages/engine/test/unit/kernel/legal-choices.test.ts` also already asserts each corresponding discovery reason directly.
5. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already covers apply-time denial context for the same causes.

## Updated Scope

This ticket is not about adding missing denial causes. It is about improving test architecture so the existing cause-complete parity contract remains robust and extensible.

## Architecture Check

1. A table-driven denial matrix with typed exhaustive coverage is cleaner and more extensible than repeated per-cause test bodies.
2. Encoding all causes in one typed fixture reduces accidental omission when denial causes evolve.
3. This remains game-agnostic and keeps runtime/kernel semantics unchanged.
4. No compatibility aliases; maintain one canonical denial behavior across `legalChoicesDiscover`, `legalMoves`, and `applyMove`.

## What to Change

### 1. Refactor free-operation denial parity tests to a typed exhaustive matrix

- Replace repeated per-cause parity tests with a table-driven matrix keyed by denial cause.
- Include all current denied causes:
  - `noActiveSeatGrant`
  - `sequenceLocked`
  - `actionClassMismatch`
  - `actionIdMismatch`
  - `zoneFilterMismatch`
- Keep assertions across all three legality surfaces:
  - `legalChoicesDiscover` reason
  - `legalMoves` exclusion
  - `applyMove` `freeOperationDenial.cause`

### 2. Preserve existing direct reason and integration coverage

- Keep `legal-choices` direct reason tests and integration denial-context tests as-is unless cleanup is strictly required.

## Files to Touch

- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (no change expected)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (no change expected)

## Out of Scope

- Runtime semantics changes to free-operation grant resolution.
- New denial-cause taxonomy.
- Game-specific logic changes.

## Acceptance Criteria

### Tests That Must Pass

1. Parity suite expresses free-operation denial parity as a table-driven, cause-complete matrix.
2. Matrix is typed to enforce inclusion of every current denied cause.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cross-surface legality semantics remain deterministic and aligned.
2. Test architecture remains game-agnostic and reusable.
3. No runtime behavior changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — refactor existing free-operation denial parity checks into a typed exhaustive matrix.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Refactored free-operation denial parity tests in `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` from repeated per-cause tests into a single typed table-driven matrix.
  - Matrix now encodes all denied causes (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`) with per-cause scenario state builders and expected `legalChoicesDiscover` reasons.
- **Deviations from Original Plan**:
  - Original ticket assumption of missing `actionClassMismatch`/`zoneFilterMismatch` parity coverage was incorrect; scope was corrected to architectural hardening rather than adding missing cause coverage.
  - No changes were required in `legal-choices.test.ts` or integration tests because coverage there was already present and aligned.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`312`/`312`).
  - `pnpm turbo lint` passed.
