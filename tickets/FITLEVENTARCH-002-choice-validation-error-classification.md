# FITLEVENTARCH-002: Choice Validation Error Classification for Event Move Parameters

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — move decision validation/classification path, legality diagnostics, integration tests
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, specs/29-fitl-event-card-encoding.md

## Problem

Invalid provided `chooseN`/target parameters can currently surface as `moveHasIncompleteParams` instead of a direct invalid-parameter reason (for example “outside options domain”). This makes diagnostics less precise, weakens test contracts, and obscures true input-validation failures.

## Assumption Reassessment (2026-03-07)

1. `validateDecisionSequenceForMove` in `packages/engine/src/kernel/apply-move.ts` maps unresolved decision sequences to `MOVE_HAS_INCOMPLETE_PARAMS` unless an explicit runtime validation error is thrown.
2. In current event flows, some invalid supplied values are treated as unresolved/incomplete decisions rather than deterministic invalid-param failures.
3. FITL edge-case tests (Bombing Pause targeting) had to tolerate both error classes, indicating insufficiently strict classification.

## Architecture Check

1. Deterministic error classification is cleaner than mixed “incomplete vs invalid” ambiguity and improves author/test reliability.
2. This is pure kernel legality semantics and remains fully game-agnostic.
3. No backwards compatibility shims: adopt a stricter canonical policy where supplied-but-invalid decision params are always `MOVE_PARAMS_INVALID`.

## What to Change

### 1. Tighten decision-sequence validation for provided params

Enhance move decision validation so when a decision param is supplied but fails domain/cardinality checks, classification resolves to invalid-params rather than incomplete-params.

### 2. Standardize legality reason mapping

Ensure `applyMove`/`legalChoices` decision-validation surfaces consistent, machine-checkable reasons for:
- missing required params
- invalid domain values
- invalid cardinality values

### 3. Strengthen diagnostics payload shape

Include decision ID/name and normalized invalid-value details in legality context to support deterministic assertions and better debugging.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` (modify)
- `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)

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

1. Add targeted tests for missing-vs-invalid classification boundaries in decision sequence validation.
2. Update integration tests to assert single canonical invalid reason for out-of-domain target values.
3. Verify no regressions in legal choice probing paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` — assert canonical invalid classification for out-of-domain selections.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` (or nearest apply-move legality suite) — add missing-vs-invalid decision param classification tests.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (or nearest suite) — add domain/cardinality classification coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
