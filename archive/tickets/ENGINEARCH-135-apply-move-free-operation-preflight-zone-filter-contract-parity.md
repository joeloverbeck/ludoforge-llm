# ENGINEARCH-135: applyMove Free-Operation Preflight Zone-Filter Contract Parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — applyMove preflight/evalCtx free-operation context wiring + legality surface parity tests
**Deps**: archive/tickets/ENGINEARCH-124-unify-free-operation-denial-analysis-single-pass.md, archive/tickets/ENGINEARCH-132-free-operation-zone-filter-binding-resolution-contract.md, archive/tickets/ENGINEARCH-133-canonical-free-operation-zone-filter-surface-contract.md, archive/tickets/ENGINEARCH-134-free-operation-zone-filter-surface-path-regression-matrix.md

## Problem

`applyMove` now uses canonical free-operation analysis for denial + execution seat, but it does not thread `freeOperationZoneFilter` and diagnostics into preflight `evalCtx`. This can diverge strict execution-time applicability from discovery-time applicability for zone-filtered pipeline predicates.

## Assumption Reassessment (2026-02-28)

1. `resolveActionApplicabilityPreflight` already supports `freeOperationZoneFilter` and diagnostics fields and propagates them into `evalCtx`.
2. `legalChoicesDiscover` threads canonical free-operation zone-filter context into preflight, so discovery-side pipeline checks run with zone-filter awareness.
3. Confirmed mismatch: in `resolveMovePreflightContext` (`applyMove`, validation mode), free-operation preflight currently threads only `executionPlayerOverride` for free-operation moves; it does not pass `freeOperationZoneFilter` or `freeOperationZoneFilterDiagnostics`.
4. Existing tests already cover denial-path typed errors for zone-filter evaluation (`FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`) and free-operation denial parity causes, but do not explicitly lock pipeline-applicability parity when applicability depends on threaded zone-filter context.

## Architecture Check

1. A single free-operation preflight contract across discovery and strict execution is cleaner and more robust than partial wiring by surface.
2. This is runtime-policy plumbing only; no game-specific branching or data contracts are introduced in GameDef/kernel/simulator.
3. No backwards-compatibility aliasing: strict and discovery surfaces converge on one canonical preflight context model.

## What to Change

### 1. Thread free-operation zone-filter context in applyMove validation preflight

In `resolveMovePreflightContext` validation preflight, pass canonical-analysis `zoneFilter` and strict-surface diagnostics into `resolveActionApplicabilityPreflight` alongside execution override.

### 2. Add strict/discovery parity coverage for zone-filtered pipeline applicability

Add tests where action-pipeline applicability depends on free-operation zone-filter context and verify consistent legality outcomes between `legalChoicesDiscover` and `applyMove` for equivalent move shapes.

### 3. Keep strict error semantics unchanged

Ensure `turnFlowEligibility` strict-path error behavior remains typed and unchanged (`FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`) while still using threaded preflight context.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/eval-context.ts` (modify; widen diagnostics source typing to existing zone-filter surfaces)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- Redesigning free-operation denial taxonomy.
- Non-card-driven turn order semantics.
- Visual-config or presentation-layer changes.

## Acceptance Criteria

### Tests That Must Pass

1. `applyMove` preflight for free-operation moves uses canonical execution seat + zone-filter context.
2. Zone-filtered pipeline applicability results are parity-locked between discovery and strict execution surfaces.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Discovery and strict preflight share one free-operation context contract (`executionPlayerOverride`, `freeOperationZoneFilter`, diagnostics).
2. Engine remains game-agnostic; game-specific behavior continues to be authored in GameSpecDoc/GameDef data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add a focused case asserting free-operation zone-filter context influences strict validation preflight pipeline applicability.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add/strengthen parity coverage for zone-filtered free-operation pipeline applicability paths across `legalChoicesDiscover` and `applyMove`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Wired `applyMove` validation preflight to pass canonical free-operation `zoneFilter` and diagnostics (`source: turnFlowEligibility`, `actionId`, `moveParams`) into `resolveActionApplicabilityPreflight`.
  - Widened `FreeOperationZoneFilterDiagnostics.source` typing to the canonical zone-filter surface union so strict/discovery callers share one diagnostics contract.
  - Added strict-path regression coverage in `apply-move.test.ts` for free-operation pipeline applicability that depends on zone-filtered zone queries.
  - Added legality-surface parity coverage in `legality-surface-parity.test.ts` for the same zone-filtered pipeline applicability scenario.
- **Deviations From Original Plan**:
  - Included one additional contract-level typing update (`eval-context.ts`) required to thread strict diagnostics cleanly; this was not explicit in the initial ticket draft but was necessary to satisfy the intended preflight contract parity.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (322/322).
  - `pnpm turbo lint` passed.
