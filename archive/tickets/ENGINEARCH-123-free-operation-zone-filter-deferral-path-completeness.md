# ENGINEARCH-123: Free-Operation Zone-Filter Deferral Path Completeness

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — turn-flow eligibility zone-filter evaluation control flow
**Deps**: tickets/ENGINEARCH-122-free-operation-zone-filter-deferral-generic-binding-classifier.md

## Problem

Deferral logic for unresolved zone-filter bindings is currently applied only in one evaluation branch (`zones.length === 0`). The per-candidate evaluation branch still throws unconditionally, creating inconsistent discovery behavior for partially bound decision probes.

## Assumption Reassessment (2026-02-27)

1. `evaluateZoneFilterForMove` has two catch paths: no-candidate-zone and per-candidate-zone loop.
2. Only the no-candidate path currently applies unresolved-binding deferral policy.
3. `legalChoices` zone-option filtering in `eval-query.ts` has its own per-zone free-operation catch path that currently throws without deferral.
4. Existing test coverage validates no-candidate deferral behavior (`move-decision-sequence.test.ts`), but did not lock the per-candidate unresolved-binding path in either `turn-flow-eligibility.ts` or `eval-query.ts`.
5. Mismatch: deferral policy is not path-complete; corrected scope is to apply one canonical deferral policy in all relevant per-zone branches and add explicit branch-complete tests.

## Architecture Check

1. A path-complete policy is cleaner than branch-specific behavior and avoids probe-time nondeterminism.
2. This remains game-agnostic and purely runtime-contract focused.
3. No compatibility aliases; uniform behavior across all zone-filter evaluation paths.

## What to Change

### 1. Centralize catch-path decisioning

Apply one shared deferral decision helper for both evaluation branches inside `evaluateZoneFilterForMove`.
Also apply the same policy in `eval-query.ts` zone-option filtering (`applyZonesFilter`) when `freeOperationZoneFilterDiagnostics.source === 'legalChoices'`.

### 2. Add branch-completeness contract tests

Add tests that exercise unresolved-binding behavior in both:
- no-zone-candidates path
- per-zone-candidate path
- legal-moves template generation path (surface: `legalChoices`) for per-zone candidate probing

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if needed to assert template probing invariants)

## Out of Scope

- New free-operation denial reasons.
- Changes to action eligibility semantics beyond zone-filter deferral consistency.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery probing no longer diverges by zone-candidate path when unresolved bindings are deferrable.
2. Typed runtime errors still surface for non-deferrable failures in both branches.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Branch-independent free-operation zone-filter evaluation policy.
2. No game-specific identifiers or branches introduced into engine logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — retain existing no-zone-path assertion and add explicit per-zone unresolved-binding deferral case.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add per-zone unresolved-binding deferral case to verify template variant generation remains stable under branch-complete deferral.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

Implemented:
1. Shared unresolved-binding deferral policy in both branches of `evaluateZoneFilterForMove` (`turn-flow-eligibility.ts`).
2. Equivalent deferral handling in `eval-query.ts` (`applyZonesFilter`) when probing free-operation zone filters on the `legalChoices` surface.
3. New branch-completeness tests for per-zone unresolved-binding deferral in:
   - `move-decision-sequence.test.ts`
   - `legal-moves.test.ts`

Originally planned vs actual:
1. Planned scope referenced only `turn-flow-eligibility.ts`; actual code path required extending scope to `eval-query.ts` after assumption reassessment against current runtime behavior.
2. All listed verification commands pass.
