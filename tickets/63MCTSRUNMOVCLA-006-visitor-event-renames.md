# 63MCTSRUNMOVCLA-006: Update visitor event types and console visitor

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — MCTS `visitor.ts`, `search.ts`, test helpers
**Deps**: 63MCTSRUNMOVCLA-004, 63MCTSRUNMOVCLA-005

## Problem

Visitor event types still use compile-time vocabulary (`concreteCount`/`templateCount`, `concrete`/`templates`, `MctsTemplateDroppedEvent`). Now that all classification is runtime-based, the vocabulary must reflect move readiness (`readyCount`/`pendingCount`, `ready`/`pending`, `MctsMoveDroppedEvent`).

## Assumption Reassessment (2026-03-16)

1. `MctsSearchStartEvent` has `concreteCount` and `templateCount` fields — **confirmed** in `visitor.ts`.
2. `MctsRootCandidatesEvent` has `concrete` and `templates` fields — **confirmed**.
3. `MctsTemplateDroppedEvent` has `type: 'templateDropped'` — **confirmed**.
4. `createConsoleVisitor` in test helpers logs these events — **confirmed** at `packages/engine/test/helpers/mcts-console-visitor.ts`.
5. The `MctsSearchEvent` discriminated union includes all three — **confirmed**.

## Architecture Check

1. Pure rename — no behavioral changes. The events carry the same data, just with accurate names.
2. No backwards-compatibility aliases. All consumers updated atomically.
3. No game-specific logic involved.

## What to Change

### 1. Rename `MctsSearchStartEvent` fields

In `visitor.ts`:
- `concreteCount` → `readyCount`
- `templateCount` → `pendingCount`

### 2. Rename `MctsRootCandidatesEvent` fields

In `visitor.ts`:
- `concrete` → `ready`
- `templates` → `pending`

### 3. Rename `MctsTemplateDroppedEvent` → `MctsMoveDroppedEvent`

In `visitor.ts`:
- Rename the interface.
- Change `type: 'templateDropped'` → `type: 'moveDropped'`.
- Update `reason` union: `'unsatisfiable' | 'stochasticUnresolved' | 'applyMoveFailed'` → `'unsatisfiable' | 'stochasticUnresolved' | 'illegal' | 'classificationError'`.

### 4. Update `MctsSearchEvent` discriminated union

Replace `MctsTemplateDroppedEvent` with `MctsMoveDroppedEvent` in the union type.

### 5. Update emission sites

- `search.ts`: Update `searchStart` and `rootCandidates` event construction to use new field names.
- `materialization.ts`: Update `classifyMovesForSearch` and `materializeMovesForRollout` to emit `moveDropped` instead of `templateDropped`.
- `expansion.ts` or `search.ts`: If `applyMoveFailed` reason exists, update to `classificationError` where appropriate.

### 6. Update `createConsoleVisitor` test helper

In `packages/engine/test/helpers/mcts-console-visitor.ts`, update the event handler to use new type names and field names.

### 7. Update `mcts/index.ts` exports

Replace `MctsTemplateDroppedEvent` export with `MctsMoveDroppedEvent`.

## Files to Touch

- `packages/engine/src/agents/mcts/visitor.ts` (modify — rename types and fields)
- `packages/engine/src/agents/mcts/search.ts` (modify — update event construction)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — update event emissions)
- `packages/engine/src/agents/mcts/index.ts` (modify — update exports)
- `packages/engine/test/helpers/mcts-console-visitor.ts` (modify — update event handling)
- `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` (modify — update event assertions)
- `packages/engine/test/unit/agents/mcts/materialization-visitor.test.ts` (modify — update event assertions)

## Out of Scope

- Behavioral changes to classification or materialization logic
- FITL validation (ticket 007)
- Kernel changes
- Runner changes (runner AI overlay integration is out of scope per spec section 10)
- Adding new visitor events beyond the renames specified

## Acceptance Criteria

### Tests That Must Pass

1. `search-visitor.test.ts` — updated to assert new field names (`readyCount`, `pendingCount`, `ready`, `pending`).
2. `materialization-visitor.test.ts` — updated to assert `moveDropped` event type with new reason values.
3. No references to `concreteCount`, `templateCount`, `MctsTemplateDroppedEvent`, or `type: 'templateDropped'` remain in production code.
4. `pnpm -F @ludoforge/engine build` — compiles cleanly.
5. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. All visitor event types use runtime classification vocabulary (ready/pending, not concrete/template).
2. The `MctsSearchEvent` discriminated union remains exhaustive — no event type accidentally dropped.
3. `createConsoleVisitor` logs the same information with updated names.
4. No game-specific identifiers introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` — update all `searchStart` and `rootCandidates` assertions
2. `packages/engine/test/unit/agents/mcts/materialization-visitor.test.ts` — update `templateDropped` → `moveDropped` assertions
3. Grep codebase for old names to confirm zero remaining references

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
