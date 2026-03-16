# 62MCTSSEAVIS-002: Add visitor & Decision Config Fields to MctsConfig

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/mcts/config.ts
**Deps**: 62MCTSSEAVIS-001

## Problem

MctsConfig needs three new fields: `visitor` (for real-time observation), `decisionWideningCap` (threshold for progressive widening bypass at decision nodes), and `decisionDepthMultiplier` (pool sizing for decision subtrees).

## What to Change

### 1. Add fields to MctsConfig interface

```typescript
readonly visitor?: MctsSearchVisitor;
readonly decisionWideningCap?: number;    // default 12
readonly decisionDepthMultiplier?: number; // default 4
```

### 2. Update validateMctsConfig()

- `visitor`: pass through without validation (callback, not tuneable)
- `decisionWideningCap`: validate as positive integer, default 12
- `decisionDepthMultiplier`: validate as positive integer >= 1, default 4
- Exclude `visitor` from `Object.freeze()` (callbacks are mutable references)

### 3. Update preset definitions

Add `decisionWideningCap` and `decisionDepthMultiplier` to preset configs (fast/default/strong) with appropriate values.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify)

## Out of Scope

- Wiring visitor into search loop (62MCTSSEAVIS-003)
- Node pool sizing changes (62MCTSSEAVIS-012)
- Any changes to existing 63MCTSPERROLLFRESEA config fields
- Decision node architecture (62MCTSSEAVIS-007)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `validateMctsConfig({})` returns defaults for new fields (`decisionWideningCap: 12`, `decisionDepthMultiplier: 4`, `visitor: undefined`)
2. Unit test: `validateMctsConfig({ decisionWideningCap: 0 })` throws validation error
3. Unit test: `validateMctsConfig({ decisionDepthMultiplier: 0 })` throws validation error
4. Unit test: `validateMctsConfig({ visitor: { onEvent: () => {} } })` passes — visitor accepted without validation
5. Unit test: frozen config still allows visitor callback reference
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing MctsConfig fields and defaults unchanged
2. `visitor` is NOT validated, NOT frozen, NOT in presets
3. `decisionWideningCap` and `decisionDepthMultiplier` ARE validated and in presets
4. Presets remain backward-compatible (new fields have defaults)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/config.test.ts` — extend existing config tests with new field validation

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern config`
2. `pnpm turbo build && pnpm turbo typecheck`
