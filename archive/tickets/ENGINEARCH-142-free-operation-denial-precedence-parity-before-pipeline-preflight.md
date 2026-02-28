# ENGINEARCH-142: Free-Operation Denial Precedence Parity Before Pipeline Preflight

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `applyMove` strict validation ordering + overlap-parity coverage
**Deps**: archive/tickets/ENGINEARCH-135-apply-move-free-operation-preflight-zone-filter-contract-parity.md, archive/tickets/ENGINEARCH-136-canonical-free-operation-analysis-api-without-legacy-overlaps.md

## Problem

`applyMove` currently computes free-operation analysis but still runs action/pipeline applicability preflight first. In overlap states (free-operation denied and pipeline also not applicable), strict validation can emit generic pipeline illegality (`ACTION_NOT_LEGAL_IN_CURRENT_STATE`) before canonical free-operation denial (`FREE_OPERATION_NOT_GRANTED`). `legalChoicesDiscover` denies first and only then evaluates preflight, so strict and discovery diverge.

## Assumption Reassessment (2026-02-28)

1. Confirmed: `validateMove` in `apply-move.ts` resolves free-operation analysis, then calls `resolveMovePreflightContext(..., 'validation', ...)`, and only afterwards checks `freeOperationAnalysis.denial.cause !== 'granted'`.
2. Confirmed: `legalChoicesDiscover` evaluates `resolveFreeOperationDiscoveryAnalysis` and returns free-operation denial (`freeOperation*` illegal reasons) before any applicability preflight.
3. **Discrepancy found**: existing tests assert denied free-operation parity and pipeline-inapplicability parity, but do not explicitly assert an overlap scenario where both could fire; the ticket scope must include this overlap regression guard.

## Architecture Reassessment

1. Denial-first ordering is architecturally cleaner than letting preflight ordering implicitly decide user-visible legality outcomes.
2. The change is game-agnostic kernel policy (no game-specific branching, no schema specialization).
3. No backward-compatibility aliasing: strict surface should emit canonical denial when denial exists.

## Updated Scope

### 1. Enforce strict free-operation denial precedence in `applyMove`

In validation flow, if free-operation analysis returns non-granted denial for a card-driven free-operation move, throw `FREE_OPERATION_NOT_GRANTED` before pipeline/actor/executor applicability illegality mapping can trigger.

### 2. Add explicit overlap regression coverage

Add tests where:
- free-operation denial is guaranteed, and
- pipeline applicability is also false,
- then assert strict returns `FREE_OPERATION_NOT_GRANTED` and discovery/strict parity remains aligned on denial-first semantics.

### 3. Preserve typed zone-filter evaluation error semantics

Keep existing `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` behavior unchanged; precedence reordering must not swallow typed evaluation failures.

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

1. Strict denied free-operation moves return `FREE_OPERATION_NOT_GRANTED` even when downstream pipeline applicability would also fail.
2. Discovery (`legalChoicesDiscover`) and strict (`applyMove`) remain parity-locked for denial-first overlap scenarios.
3. Existing typed zone-filter evaluation failure behavior remains intact.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical free-operation denial remains the first strict legality gate for denied free-operation requests.
2. Engine/runtime stays game-agnostic; game-specific behavior remains authored in GameSpecDoc/GameDef data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add overlap scenario asserting strict denial precedence over pipeline inapplicability.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add parity case for denied free-operation + pipeline inapplicability overlap.
3. Existing free-operation zone-filter diagnostics assertions continue to validate typed error preservation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Reordered strict validation in `applyMove` so denied card-driven free-operation requests throw `FREE_OPERATION_NOT_GRANTED` before action/pipeline applicability preflight can mask the denial.
  - Added overlap regression tests in:
    - `packages/engine/test/unit/kernel/apply-move.test.ts`
    - `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
  - Updated integration expectation in `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` to match canonical denial-first behavior after grant consumption.
- **Deviations from original plan**:
  - Scope expanded by one integration test update because full engine-suite validation surfaced a legacy assertion aligned to old precedence.
- **Verification results**:
  - `pnpm turbo build` passed.
  - Focused tests passed:
    - `node packages/engine/dist/test/unit/kernel/apply-move.test.js`
    - `node packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
  - `pnpm -F @ludoforge/engine test` passed (`324/324`).
  - `pnpm turbo lint` passed.
