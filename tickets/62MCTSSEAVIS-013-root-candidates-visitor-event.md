# 62MCTSSEAVIS-013: Wire rootCandidates Visitor Event

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents/mcts/search.ts
**Deps**: 62MCTSSEAVIS-003

## Problem

At the start of each search, after partitioning legal moves into concrete and template, the visitor should receive a `rootCandidates` event showing the full candidate set. This enables test assertions and CI diagnostics on what actions are available.

## What to Change

### 1. Emit `rootCandidates` after legal move partitioning

In `runSearch()`, after computing concrete and template move sets, emit:
```typescript
if (config.visitor?.onEvent) {
  config.visitor.onEvent({
    type: 'rootCandidates',
    concrete: concreteList.map(m => ({ actionId: m.actionId, moveKey: m.key })),
    templates: templateList.map(m => ({ actionId: m.actionId })),
  });
}
```

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify — add emission after partitioning)

## Out of Scope

- Other visitor events (already wired in 62MCTSSEAVIS-003, 004)
- Decision node events (62MCTSSEAVIS-010)
- Any search logic changes

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: search emits `rootCandidates` event with correct concrete and template lists
2. Unit test: `rootCandidates.concrete` includes `actionId` and `moveKey` for each concrete move
3. Unit test: `rootCandidates.templates` includes `actionId` for each template move
4. Unit test: event is emitted before `searchStart` batch processing begins
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `rootCandidates` is emitted exactly once per search, before iteration loop
2. No search logic changes — pure observer emission

## Test Plan

### New/Modified Tests

1. Extend `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` — rootCandidates event

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern search`
2. `pnpm turbo build && pnpm turbo typecheck`
