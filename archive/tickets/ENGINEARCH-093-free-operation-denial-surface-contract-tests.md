# ENGINEARCH-093: Simulator-Facing Free-Operation Denial Surface Contract Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract tests plus legality-surface denial projection alignment
**Deps**: ENGINEARCH-091-typed-free-operation-denial-contract.md

## Problem

Free-operation denial semantics are centralized, but simulator-facing surfaces still diverge: `applyMove` emits typed denial causes while `legalChoicesDiscover` can currently proceed on unmatched free-operation probes in some states.

## Assumption Reassessment (2026-02-27)

1. ✅ Denial causes are computed by a shared analyzer in turn-flow eligibility (`explainFreeOperationBlockForMove`).
2. ❌ Prior assumption that only tests are missing is inaccurate: integration coverage already includes `actionIdMismatch` and `noActiveSeatGrant` at apply-time.
3. ✅/❌ Mixed state: parity coverage is incomplete, and there is a behavior mismatch where `legalChoicesDiscover` does not consistently project free-operation denial outcomes before decision probing.
4. Corrected scope: enforce denial projection parity first, then add contract tests at canonical parity locations.

## Architecture Check

1. One canonical denial analyzer should drive all surfaces (`legalMoves`, `legalChoicesDiscover`, `resolveMoveDecisionSequence`, `applyMove`).
2. Contract tests should live in parity-focused suites to reduce drift and avoid duplicated scenario scaffolding.
3. No compatibility aliases; denial semantics should be explicit and uniform.

## What to Change

### 1. Align denial projection in legal choices surface

Ensure `legalChoicesDiscover` rejects free-operation moves when the denial analyzer reports non-granted causes, instead of allowing partial/complete progression.

### 2. Extend parity coverage for free-operation denial causes

Add parity tests that validate denial semantics across discovery, decision probing, and apply-time surfaces for:
- `actionIdMismatch`
- `noActiveSeatGrant`
- `sequenceLocked` explanation shape (including blocker ids)

### 3. Consolidate tests in canonical parity areas

Prefer extending `legality-surface-parity` and focused turn-flow unit tests over duplicating broad integration fixtures unless required for end-to-end confirmation.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/legality-reasons.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify: sequence lock explanation shape assertions)

## Out of Scope

- New runtime features unrelated to free-operation denial projection.
- Changes to grant data model beyond denial projection parity.

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoicesDiscover` rejects denied free-operation moves consistently with turn-flow denial semantics.
2. Parity tests cover `actionIdMismatch` and `noActiveSeatGrant` denial behavior across relevant surfaces.
3. Sequence-lock denial assertions verify explanation fields, including blocker identifiers.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation denial semantics remain deterministic and analyzer-driven.
2. Contract tests remain game-agnostic and avoid game-specific kernel branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — free-operation denial projection parity for `actionIdMismatch` and `noActiveSeatGrant`.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — direct legal-choices denial expectations for denied free-operation probes.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — sequence-lock denial explanation shape/fields regression guard.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Added explicit free-operation denial projection in `legalChoicesDiscover` for card-driven denial causes (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`) using the shared analyzer.
  - Added/extended contract tests in parity-focused suites:
    - free-operation denial parity in `legality-surface-parity.test.ts` for `actionIdMismatch` and `noActiveSeatGrant`
    - direct legal-choices denial coverage in `legal-choices.test.ts`
    - sequence-lock denial explanation shape guard in `fitl-event-free-operation-grants.test.ts`
  - Extended `explainFreeOperationBlockForMove` with optional zone-filter evaluation control to preserve pending-decision behavior while keeping canonical analyzer usage.
- **Deviations From Original Plan**:
  - Scope correction was required: existing integration tests already covered some denial causes; work shifted to parity canonical tests plus behavior alignment in `legalChoicesDiscover` instead of test-only additions.
  - Kept non-card-driven `freeOperation` behavior unchanged (allowed) to preserve existing engine semantics outside card-driven grant flow.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js` ✅
  - `node packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (307 passed, 0 failed)
  - `pnpm turbo lint` ✅
