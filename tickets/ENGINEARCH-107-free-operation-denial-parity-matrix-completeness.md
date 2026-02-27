# ENGINEARCH-107: Free-Operation Denial Parity Matrix Completeness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — parity contract tests across simulator-facing legality surfaces
**Deps**: tickets/ENGINEARCH-106-free-operation-denial-cause-mapping-exhaustiveness.md

## Problem

Current parity coverage for free-operation denial semantics is partial. Canonical parity tests cover only some denial causes, leaving drift risk for other causes across `legalMoves`, `legalChoicesDiscover`, and `applyMove`.

## Assumption Reassessment (2026-02-27)

1. Parity scaffolding exists and is already used for legality-surface contract tests.
2. Current free-operation parity checks explicitly cover `actionIdMismatch` and `noActiveSeatGrant`.
3. Mismatch: coverage is incomplete for `actionClassMismatch` and `zoneFilterMismatch` in parity-focused suites; corrected scope is full denial-cause parity matrix coverage.

## Architecture Check

1. Table-driven parity matrices are cleaner and more extensible than isolated single-cause tests.
2. This reinforces game-agnostic runtime guarantees without introducing game-specific rules into kernel code.
3. No compatibility aliases; contract tests should enforce one canonical denial behavior across surfaces.

## What to Change

### 1. Expand parity matrix coverage to all denial causes surfaced in discovery

Add parity scenarios for:
- `actionClassMismatch`
- `zoneFilterMismatch`
- preserve existing coverage for `actionIdMismatch` and `noActiveSeatGrant`
- optionally include `sequenceLocked` when scenario setup is stable in parity harness

### 2. Prefer table-driven parity test structure

Refactor free-operation parity cases into table-driven fixtures with expected:
- `legalChoicesDiscover` reason
- `legalMoves` inclusion/exclusion expectation
- `applyMove` denial cause in `freeOperationDenial.cause`

### 3. Keep integration assertions focused on end-to-end shape guarantees

Retain integration tests for explanation field shape and sequencing while moving cause-projection parity guarantees to the canonical parity suite.

## Files to Touch

- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify only if direct reason assertions need complement coverage)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if dedup/overlap cleanup is needed)

## Out of Scope

- Runtime semantics changes to free-operation grant resolution.
- New denial-cause taxonomy.

## Acceptance Criteria

### Tests That Must Pass

1. Parity suite contains cause-complete free-operation denial matrix coverage for discovery/apply/legalMoves surfaces.
2. `actionClassMismatch` and `zoneFilterMismatch` are parity-validated, not only apply-time validated.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cross-surface legality semantics remain deterministic and aligned.
2. Test architecture remains game-agnostic and reusable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — table-driven denial parity matrix (all targeted causes).
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — direct discovery denial reason assertions for any newly added matrix causes.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — preserve sequence/explanation integration invariants where unit parity cannot substitute.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`
