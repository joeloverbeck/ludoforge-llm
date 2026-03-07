# FITLEVENTARCH-010: Canonical Legal-Move Decision Policy Surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legal move decision-policy centralization in kernel move-decision-sequence + legal-moves callsites
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-008-unknown-satisfiability-legal-move-policy-harmonization.md

## Problem

Unknown/unsatisfiable decision-sequence policy is only partially centralized:
- pipeline and free-operation unresolved branches now use a shared helper,
- event move enumeration still applies inline classification/fallback logic.

This leaves duplicated policy paths and reintroduces drift risk.

## Assumption Reassessment (2026-03-07)

1. `legal-moves.ts` event path still performs local decision-policy handling (`classifyMoveDecisionSequenceSatisfiability` + local `shouldDeferMissingBinding` fallback + `classification === 'unsatisfiable'` gate).
2. Pipeline and free-operation unresolved paths now use `isMoveDecisionSequenceNotUnsatisfiable(...)`.
3. Mismatch: policy centralization is incomplete; one path remains hand-rolled and can diverge.

## Architecture Check

1. One canonical legal-move decision-policy surface is cleaner and more robust than per-callsite policy branches.
2. This change stays fully game-agnostic (kernel/runtime behavior only); no GameSpecDoc game-specific branching is introduced.
3. No backward-compatibility aliasing/shims: replace inline policy with a single canonical API and remove redundant callsite logic.

## What to Change

### 1. Introduce canonical legal-move decision-policy helper

Add a helper in `move-decision-sequence.ts` that encapsulates legal-move admission policy (exclude only `unsatisfiable`, normalize deferrable binding failures to `unknown` where applicable).

### 2. Route all legal-move callsites through canonical helper

Update `legal-moves.ts` event path to consume the canonical helper so event, pipeline, and free-operation unresolved branches share one policy contract.

### 3. Add policy-shape guard tests

Add tests that fail if legal-move callsites reintroduce inline decision-policy branches instead of the canonical helper.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Agent stochastic fallback contract work (`FITLEVENTARCH-009`)
- Event target payload/schema ownership tickets
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Event, pipeline, and free-operation unresolved legal-move branches all derive decision admission from one canonical helper/API.
2. Event-path behavior remains: unsatisfiable excluded; unknown/deferrable uncertainty retained.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move decision-sequence policy has a single kernel source of truth.
2. GameDef/simulator remain game-agnostic; no game-specific logic paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — source/behavior guards ensuring event path uses canonical decision-policy helper.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — canonical helper contract for deferrable-error normalization + unknown/unsat handling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
