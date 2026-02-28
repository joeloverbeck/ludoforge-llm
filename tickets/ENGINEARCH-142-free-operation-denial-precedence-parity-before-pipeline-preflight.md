# ENGINEARCH-142: Free-Operation Denial Precedence Parity Before Pipeline Preflight

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — applyMove strict validation ordering + legality surface parity coverage
**Deps**: archive/tickets/ENGINEARCH-135-apply-move-free-operation-preflight-zone-filter-contract-parity.md, archive/tickets/ENGINEARCH-136-canonical-free-operation-analysis-api-without-legacy-overlaps.md

## Problem

`applyMove` validation preflight can now evaluate pipeline applicability with free-operation zone-filter context before strict free-operation denial is surfaced. This can mask canonical denial outcomes (`FREE_OPERATION_NOT_GRANTED` with denial cause) behind generic pipeline illegality outcomes (`ACTION_NOT_LEGAL_IN_CURRENT_STATE`), diverging strict behavior from discovery semantics.

## Assumption Reassessment (2026-02-28)

1. `applyMove` currently resolves free-operation analysis, then executes validation preflight (`resolveActionApplicabilityPreflight`) before checking `freeOperationAnalysis.denial.cause !== 'granted'`.
2. `legalChoicesDiscover` still denies non-granted free-operation requests early through canonical denial mapping before downstream pipeline applicability handling.
3. Mismatch: strict surface can emit pipeline illegality ahead of free-operation denial while discovery emits canonical free-operation denial; corrected scope is to enforce deterministic denial precedence parity.

## Architecture Check

1. Enforcing explicit denial-precedence ordering is cleaner and more robust than relying on implicit evaluation order across multiple eligibility checks.
2. This remains game-agnostic runtime policy; no game-specific branching is introduced in GameDef/simulation/kernel.
3. No backwards-compatibility aliasing/shims: strict surface should converge on canonical denial semantics directly.

## What to Change

### 1. Enforce strict free-operation denial precedence in `applyMove`

In validation flow, if free-operation analysis returns non-granted denial, emit `FREE_OPERATION_NOT_GRANTED` before pipeline applicability rejection paths are allowed to fire.

### 2. Lock strict/discovery parity for denial-vs-pipeline ordering

Add parity tests where both a free-operation denial condition and pipeline inapplicability could apply; verify canonical free-operation denial takes precedence across surfaces.

### 3. Preserve typed error semantics

Keep existing typed turn-flow zone-filter evaluation errors unchanged (`FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`) and ensure precedence change does not suppress those errors.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- Turn-flow rules redesign or denial taxonomy expansion.
- GameSpecDoc or visual-config content changes.
- Query-walk/OptionsQuery contract refactors.

## Acceptance Criteria

### Tests That Must Pass

1. Strict free-operation denied moves return `FREE_OPERATION_NOT_GRANTED` regardless of downstream pipeline applicability state.
2. Discovery (`legalChoicesDiscover`) and strict (`applyMove`) produce parity-locked denial outcomes for overlap scenarios.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical free-operation denial remains the first strict legality gate for denied free-operation requests.
2. Engine/runtime stays game-agnostic; all game-specific behavior remains authored in GameSpecDoc/GameDef data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add overlap scenario asserting strict denial precedence over pipeline illegality.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add parity matrix case for denied free-operation + pipeline inapplicability overlap.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
