# FITLEVENTARCH-008: Harmonize Unknown Satisfiability Policy in Legal Move Enumeration

**Status**: COMPLETED (2026-03-07)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal move and turn-order variant filtering policy under unknown decision satisfiability
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md

## Problem

Legal move enumeration currently applies inconsistent policy for decision-sequence `unknown` outcomes:
- event path accepts `unknown` (filters only `unsatisfiable`),
- pipeline path rejects `unknown` via `isMoveDecisionSequenceSatisfiable`.

This can hide stochastic-yet-playable actions from `legalMoves`.

## Assumption Reassessment (2026-03-07)

1. Event move enumeration in `legal-moves.ts` admits `classification === 'unknown'`.
2. Pipeline action enumeration in `legal-moves.ts` currently requires `isMoveDecisionSequenceSatisfiable(...) === true` (strict `satisfiable`).
3. Free-operation variant expansion in `legal-moves-turn-order.ts` also rejects `unknown` via the same satisfiability helper.
4. Unit coverage already codifies the strict pipeline policy: `legal-moves.test.ts` test `24. surfaces decision probe budget warnings through legal move diagnostics` currently expects an empty move list under `maxDecisionProbeSteps: 0` for a pipeline decision sequence.
5. Existing event-path regressions (`legal-moves.test.ts` tests 27/28) already enforce `unknown => kept`, `unsatisfiable => excluded`.

## Architecture Check

1. Enumeration policy must be uniform across action categories; mixed policy introduces hidden behavior differences not expressed in GameSpecDoc.
2. A single conservative policy (`exclude only unsatisfiable`) is cleaner and more extensible for stochastic/runtime-dependent workflows.
3. No compatibility aliasing: replace ad-hoc boolean gating with canonical classification policy.

## What to Change

### 1. Replace boolean satisfiability gate in pipeline enumeration

In pipeline branch of `legal-moves.ts`, use classification-based policy and exclude only `unsatisfiable`.

### 2. Align free-operation variant filtering

In `legal-moves-turn-order.ts`, use the same classification policy for unresolved decision checkpoints, excluding only `unsatisfiable`.

### 3. Add policy regressions

Update outdated pipeline regression and add/strengthen free-operation regressions proving stochastic/unknown decision templates still appear in legal moves where action applicability is otherwise valid.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Agent strategy updates
- UI rendering changes
- Event-target schema or payload ownership tickets

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline-based action templates with `unknown` decision-sequence classification are not dropped from legal move enumeration.
2. Free-operation variants with unresolved-but-not-unsatisfiable decision sequences are retained.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal move filtering uses one canonical satisfiability policy across event and non-event paths.
2. Decision-sequence uncertainty is not collapsed into false illegality.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — pipeline action remains legal-move candidate under `unknown` decision satisfiability.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — free-operation variant remains candidate under `unknown` satisfiability and is excluded only when `unsatisfiable`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

Implemented as planned, with scope tightened to actual touchpoints:

1. `legal-moves.ts`: pipeline template gating now uses satisfiability classification and excludes only `unsatisfiable` (unknown retained).
2. `legal-moves-turn-order.ts`: free-operation unresolved checkpoint gating now uses the same classification policy and excludes only `unsatisfiable`.
3. `legal-moves.test.ts`: updated existing pipeline unknown regression expectation, and added explicit free-operation unknown/unsatisfiable regressions.
4. `legal-choices.test.ts` was not modified because no helper/assertion changes were required.
5. Follow-up architecture hardening: introduced `isMoveDecisionSequenceNotUnsatisfiable(...)` in `move-decision-sequence.ts` and switched legal-move call sites to it so the policy is defined once.
