# AIORCH-001: Differentiate AI move-completion failure from no-legal-moves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`resolveAiStep` currently treats two different states as identical: (a) there are no legal moves, and (b) a legal template move exists but could not be completed. This masks diagnostics and makes AI dead-ends harder to debug.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/src/store/game-store.ts` currently maps `completeMove(...) === null` to `'no-legal-moves'`, conflating semantics.
2. The new worker API includes `completeMove(templateMove)` and returns `Move | null`; tests cover `resolveAiStep` but do not fully document semantic distinction.
3. Mismatch: ticket assumption that no distinction existed in prior behavior is correct; scope is updated to introduce explicit store-facing outcome and diagnostics without changing game rules.

## Architecture Check

1. Distinguishing completion failure from legal-move absence improves observability and keeps orchestration deterministic.
2. This remains game-agnostic: it introduces generic outcome semantics (`uncompletable-template`) and does not encode game-specific branches in runtime/simulation.
3. No backwards-compatibility aliases/shims will be added; store and worker contracts update directly.

## What to Change

### 1. Add explicit AI step outcome for completion failure

Update store AI resolution flow to return a distinct outcome when template completion fails, rather than `'no-legal-moves'`.

### 2. Surface deterministic diagnostics

Add an explicit non-fatal error/warning path (or telemetry event) describing that a legal template move was uncompletable, including action id and turn metadata.

### 3. Extend tests for step and turn loops

Add tests validating behavior for `resolveAiStep` and `resolveAiTurn` when completion fails inside loop execution.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)

## Out of Scope

- Changing engine legality/completion algorithms.
- Adding game-specific fallback policies.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveAiStep` returns distinct outcome for completion failure and does not call `applyMove`.
2. `resolveAiTurn` exits cleanly when completion failure occurs and does not set misleading no-legal-moves state.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. GameDef/runtime/simulation remain game-agnostic; no per-game branching added.
2. AI orchestration outcomes are semantically distinct: no legal move vs uncompletable template.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — add `resolveAiTurn` completion-failure branch coverage and outcome assertions.
2. `packages/runner/test/store/game-store.test.ts` — extend `resolveAiStep` assertions for diagnostics semantics.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/store/game-store.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
