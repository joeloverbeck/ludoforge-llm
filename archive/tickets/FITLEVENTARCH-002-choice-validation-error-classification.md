# FITLEVENTARCH-002: Choice Validation Error Classification for Event Move Parameters

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test-contract hardening for decision-param classification (no broad kernel refactor)
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, specs/29-fitl-event-card-encoding.md

## Problem

Bombing Pause edge-case assertions currently allow multiple error classes via regex alternation. That weakens the contract for decision-param legality and can hide regressions where invalid supplied params stop being classified canonically.

## Assumption Reassessment (2026-03-07, corrected)

1. `validateDecisionSequenceForMove` in `packages/engine/src/kernel/apply-move.ts` maps unresolved decision sequences to `MOVE_HAS_INCOMPLETE_PARAMS` unless an explicit runtime validation error is thrown.
2. Supplied invalid dynamic decision params are already classified as `MOVE_PARAMS_INVALID` in current kernel behavior (covered in `packages/engine/test/unit/apply-move.test.ts`).
3. The primary gap is test strictness and parameter-shape discipline: `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` still tolerates both invalid and incomplete classes via regex alternation and must assert canonical behavior through resolved decision IDs.

## Architecture Check

1. The current architecture already centralizes classification in `apply-move` and keeps semantics game-agnostic; this is the right place to own canonical mapping.
2. Duplicating validation/classification branches across `legal-choices` and decision helpers would increase divergence risk without adding robustness.
3. No backwards-compatibility shims: tests should enforce strict canonical behavior (`MOVE_PARAMS_INVALID` for supplied-but-invalid; `MOVE_HAS_INCOMPLETE_PARAMS` for truly missing params).

## What to Change

### 1. Tighten Bombing Pause integration assertions

Replace permissive regex assertions with reason-aware assertions that require canonical invalid classification for out-of-domain/cardinality-invalid selections.

### 2. Add explicit regression coverage for missing vs invalid boundary

Ensure tests explicitly preserve:
- missing required params
- invalid domain values
- invalid cardinality values

### 3. Avoid unnecessary kernel-surface churn

Do not refactor `move-decision-sequence`, `legal-choices`, or runtime reason enums unless tests demonstrate an actual classification defect.

## Files to Touch

- `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)

## Out of Scope

- Event data content changes unrelated to legality diagnostics
- Runner-level error presentation UX
- Non-choice action validation redesign

## Acceptance Criteria

### Tests That Must Pass

1. Supplied invalid event target selections are classified as invalid params (not incomplete params).
2. Truly missing parameters still classify as incomplete params.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Decision validation classification is deterministic for identical move params/state.
2. Error reason semantics remain game-agnostic and reusable across all games/specs.

## Tests

1. Update Bombing Pause integration tests to assert a single canonical invalid reason for out-of-domain and cardinality-invalid selections.
2. Add/strengthen targeted unit coverage for missing-vs-invalid classification boundaries in decision sequence validation.
3. Verify no regressions in engine legality paths via the full engine suite.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` — assert canonical invalid classification for out-of-domain selections.
2. `packages/engine/test/unit/apply-move.test.ts` — strengthen missing-vs-invalid decision param classification tests.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - Tightened `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` to assert canonical `MOVE_PARAMS_INVALID` classification with explicit detail checks for chooseN cardinality mismatch and out-of-domain selections.
  - Updated Bombing Pause invalid-selection integration inputs to use canonical pending `decisionId` keys (via `legalChoicesDiscover`) rather than bind-name params, so legality assertions exercise the real decision-validation path.
  - Added unit regression coverage in `packages/engine/test/unit/apply-move.test.ts` for invalid dynamic chooseN event-side params (cardinality mismatch + out-of-domain) and asserted `MOVE_PARAMS_INVALID`.
- Deviations from original plan:
  - Did not modify kernel source files (`apply-move.ts`, `move-decision-sequence.ts`, `legal-choices.ts`, `runtime-reasons.ts`) because reassessment confirmed core classification architecture was already correct and centralized; the defect was in permissive/shape-incorrect tests.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/apply-move.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
