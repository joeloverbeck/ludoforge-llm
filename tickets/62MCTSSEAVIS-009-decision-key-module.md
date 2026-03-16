# 62MCTSSEAVIS-009: Decision Key Module

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/mcts (new file)
**Deps**: 62MCTSSEAVIS-007

## Problem

Decision nodes need MoveKey generation for UCB deduplication. Template root nodes need a key that encodes the action category so all decision subtrees for the same action share UCB statistics.

## What to Change

### 1. Create `decision-key.ts`

Implement two key generation functions:

- `decisionNodeKey(actionId, bindingName, bindingValue)` → MoveKey
  - Encodes `actionId + binding name + binding value` for unique identification within a decision subtree
  - Format: `D:<actionId>:<bindingName>=<value>`

- `templateDecisionRootKey(actionId)` → MoveKey
  - Encodes just the action category for template root nodes
  - Format: `D:<actionId>`
  - All rally decision subtrees share this key at the root level

### 2. Re-export from index.ts

## Files to Touch

- `packages/engine/src/agents/mcts/decision-key.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify — add re-export)

## Out of Scope

- Search loop integration (62MCTSSEAVIS-010)
- Existing MoveKey generation for concrete moves (unchanged)
- Decision expansion logic (62MCTSSEAVIS-008)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `decisionNodeKey('rally', 'province', 'quang-tri')` produces deterministic, unique key
2. Unit test: `templateDecisionRootKey('rally')` produces `D:rally`
3. Unit test: different binding values produce different keys
4. Unit test: same inputs produce same key (deterministic)
5. Unit test: keys are valid strings (no undefined/null components)
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Decision keys are prefixed with `D:` to distinguish from concrete move keys
2. Keys are deterministic — same inputs always produce same output
3. No collision between decision keys and concrete MoveKeys

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-key.test.ts` — key generation, uniqueness, determinism

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern decision-key`
2. `pnpm turbo build && pnpm turbo typecheck`
