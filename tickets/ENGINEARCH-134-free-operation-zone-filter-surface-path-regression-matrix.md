# ENGINEARCH-134: Free-Operation Zone-Filter Surface/Path Regression Matrix

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel test contract coverage for zone-filter probe/strict branch parity
**Deps**: archive/tickets/ENGINEARCH-123-free-operation-zone-filter-deferral-path-completeness.md, tickets/ENGINEARCH-132-free-operation-zone-filter-binding-resolution-contract.md

## Problem

Current tests lock new deferral behavior on legal/probe paths, but strict/apply coverage does not explicitly lock the per-zone candidate branch. This leaves a regression gap where strict branch handling could drift without detection.

## Assumption Reassessment (2026-02-28)

1. `turn-flow-eligibility.ts` now applies shared deferral policy in both no-zone and per-zone branches.
2. Existing `apply-move.test.ts` asserts strict typed failure for malformed zone-filter evaluation, but does not explicitly cover the per-zone candidate path with candidate-zone diagnostics.
3. Mismatch: branch-complete strict-surface coverage is missing; corrected scope is to add a small regression matrix covering surface (`legalChoices` vs `turnFlowEligibility`) x path (`no-zone` vs `per-zone`) for deferrable and non-deferrable failures.

## Architecture Check

1. A surface/path regression matrix is cleaner than isolated one-off tests because it keeps policy behavior explicit and deterministic across all evaluation branches.
2. This is engine-level runtime contract hardening and keeps GameDef/simulator agnostic.
3. No backwards-compatibility aliases/shims: tests enforce the canonical current policy only.

## What to Change

### 1. Add strict per-zone failure regression

Add an `applyMove` unit test where free-operation zone-filter evaluation on `turnFlowEligibility` fails in the per-zone candidate branch and must throw `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` with `candidateZone` diagnostics.

### 2. Add minimal matrix-oriented coverage

Add/extend tests to cover:
- `legalChoices` + no-zone deferrable
- `legalChoices` + per-zone deferrable
- `turnFlowEligibility` + no-zone non-deferrable
- `turnFlowEligibility` + per-zone non-deferrable

### 3. Keep tests deterministic and non-game-specific

Use minimal synthetic action/zone fixtures and avoid game-specific rules or identifiers beyond generic test data.

## Files to Touch

- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if matrix helper needed)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add if matrix helper needed)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add if matrix helper needed)

## Out of Scope

- Changing zone-filter policy semantics.
- Introducing new runtime error codes.
- GameSpecDoc or visual-config schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Strict/apply (`turnFlowEligibility`) per-zone non-deferrable failures throw typed errors with candidate-zone diagnostics.
2. Probe/discovery (`legalChoices`) no-zone and per-zone deferrable missing-binding failures remain deferred.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Surface semantics stay explicit: only `legalChoices` defers; `turnFlowEligibility` remains strict.
2. Branch parity is enforced by tests across no-zone/per-zone paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — strict per-zone failure contract with diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — probe/per-zone deferral regression guard.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — probe/per-zone deferral regression guard.
4. `packages/engine/test/unit/kernel/legal-choices.test.ts` — optional matrix completion for discovery flow parity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo lint`
