# ENGINEARCH-123: Free-Operation Zone-Filter Deferral Path Completeness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — turn-flow eligibility zone-filter evaluation control flow
**Deps**: tickets/ENGINEARCH-122-free-operation-zone-filter-deferral-generic-binding-classifier.md

## Problem

Deferral logic for unresolved zone-filter bindings is currently applied only in one evaluation branch (`zones.length === 0`). The per-candidate evaluation branch still throws unconditionally, creating inconsistent discovery behavior for partially bound decision probes.

## Assumption Reassessment (2026-02-27)

1. `evaluateZoneFilterForMove` has two catch paths: no-candidate-zone and per-candidate-zone loop.
2. Only the no-candidate path currently applies unresolved-binding deferral policy.
3. Mismatch: deferral policy is not path-complete; corrected scope is to apply one canonical deferral policy in both branches.

## Architecture Check

1. A path-complete policy is cleaner than branch-specific behavior and avoids probe-time nondeterminism.
2. This remains game-agnostic and purely runtime-contract focused.
3. No compatibility aliases; uniform behavior across all zone-filter evaluation paths.

## What to Change

### 1. Centralize catch-path decisioning

Apply one shared deferral decision helper for both evaluation branches inside `evaluateZoneFilterForMove`.

### 2. Add branch-completeness contract tests

Add tests that exercise unresolved-binding behavior in both:
- no-zone-candidates path
- per-zone-candidate path

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
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

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — add explicit cases for both evaluation branches to lock behavior.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — verify template variant generation remains stable under branch-complete deferral.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
