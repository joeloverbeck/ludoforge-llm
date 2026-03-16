# 62MCTSSEAVIS-001: MctsSearchVisitor Interface & Event Types

**Status**: DONE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/mcts
**Deps**: None (foundation ticket)

## Problem

MCTS search is a black box. There is no callback mechanism for consumers (test loggers, CI pipelines, runner dashboard) to observe what the search is doing in real time. This ticket creates the foundational type definitions.

## What to Change

### 1. Create `visitor.ts` with MctsSearchEvent discriminated union

Define all 11 event types as specified in Spec 62 §2.2:
- `MctsSearchStartEvent`
- `MctsIterationBatchEvent`
- `MctsExpansionEvent`
- `MctsDecisionNodeCreatedEvent`
- `MctsDecisionCompletedEvent`
- `MctsDecisionIllegalEvent`
- `MctsTemplateDroppedEvent`
- `MctsApplyMoveFailureEvent`
- `MctsPoolExhaustedEvent`
- `MctsSearchCompleteEvent`
- `MctsRootCandidatesEvent`

Define `MctsSearchVisitor` interface with single `onEvent?: (event: MctsSearchEvent) => void` method.

### 2. Re-export from index.ts

Add `visitor.ts` exports to `packages/engine/src/agents/mcts/index.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/visitor.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify — add re-export)

## Out of Scope

- Wiring visitor into search loop (62MCTSSEAVIS-003)
- Wiring visitor into expansion/materialization (62MCTSSEAVIS-004)
- MctsConfig changes (62MCTSSEAVIS-002)
- Any runtime behavior changes — this is pure type definitions
- CiDiagnosticsReporter or ConsoleVisitor (62MCTSSEAVIS-005)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: import `MctsSearchVisitor` and `MctsSearchEvent` — types resolve correctly
2. Unit test: create a mock visitor, call `onEvent` with each event type, assert discriminated union `type` field
3. Unit test: visitor with `onEvent: undefined` does not throw
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All event interfaces have `readonly` fields (immutability)
2. `MctsSearchEvent` is a discriminated union on `type` field — exhaustive switch must compile
3. `MctsSearchVisitor.onEvent` is optional (undefined = no callbacks)
4. `searchComplete.stopReason` uses exact vocabulary: `'confidence' | 'solver' | 'time' | 'iterations'`
5. No runtime dependencies added — pure type/interface file

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/visitor.test.ts` — type safety, mock visitor, event construction

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern visitor`
2. `pnpm turbo build && pnpm turbo typecheck`
