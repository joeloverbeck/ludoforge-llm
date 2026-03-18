# 65MCTSCHODECARC-005: `chooseN` Unit Tests and Game Def Fixture

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: 65MCTSCHODECARC-001, 65MCTSCHODECARC-002, 65MCTSCHODECARC-003

## Problem

The `chooseN` decision expansion changes (tickets 001–003) need dedicated unit tests covering array param storage, incremental tree structure, confirm node availability, duplicate prevention, min/max cardinality, empty selection, and decision type metadata. A game-agnostic `chooseN` game def fixture is also needed.

## What to Change

### 1. Create minimal `chooseN` game def fixture

Create a self-contained, game-agnostic game def with:
- 2 players
- One action with a `chooseN` decision: "pick 1–2 target zones from 3 available"
- 3 zones (zoneA, zoneB, zoneC)
- Minimal setup (no events, no complex triggers)

This fixture is used by both unit and integration tests. Place it as a helper function in the test file or a shared fixture module.

### 2. Create unit test file

New file: `packages/engine/test/unit/agents/mcts/decision-expansion-choosen.test.ts`

Tests (per spec section 5.2):

1. **Array param storage**: Expand a `chooseN` decision node → verify `partialMove.params[bind]` is an array, not a scalar.
2. **Incremental selection**: Expand `chooseN` with 3 options, max 2 → verify tree structure has correct depth and array accumulation at each level.
3. **Confirm node availability (min: 0)**: `chooseN` with `min: 0` → confirm node available at root level.
4. **Confirm node availability (min: 2)**: `chooseN` with `min: 2` → confirm node NOT available until 2 items selected.
5. **Duplicate prevention**: Children at level 2 only include options with index > parent's selected index (no `['B','A']` when `['A','B']` exists).
6. **Min/max cardinality**: `chooseN` with `min: 1, max: 3` → no confirm at 0 selections, confirm available at 1–3, no expansion beyond 3.
7. **Empty selection**: `chooseN` with `min: 0` → confirm with empty array `[]` is a valid child.
8. **Single option**: `chooseN` with 1 option, `min: 1, max: 1` → one child with `[option]`, immediate confirm.
9. **Decision type metadata**: Verify `MctsNode.decisionType` is `'chooseN'` for chooseN nodes and `'chooseOne'` for chooseOne nodes.
10. **chooseOne regression**: Existing `chooseOne` expansion still produces scalar params (not arrays).

### 3. Test approach

Tests should call `expandDecisionNode` directly (or a thin wrapper around it), providing a mock or minimal `DecisionExpansionContext` with a `discoverChoices` override that returns controlled `ChoicePendingChooseNRequest` responses. This isolates decision expansion from the full MCTS search loop.

The existing `decision-expansion.test.ts` already uses this pattern — follow its conventions for context setup, node pool creation, and assertion style.

## Files to Touch

- `packages/engine/test/unit/agents/mcts/decision-expansion-choosen.test.ts` (new)
- Optionally: `packages/engine/test/helpers/mcts-test-helpers.ts` or similar if a shared fixture is warranted (new, only if needed)

## Out of Scope

- Integration tests (ticket 006)
- FITL E2E tests (ticket 007)
- Production source code changes
- Kernel or compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. All 10 unit tests described above pass
2. All existing `decision-expansion.test.ts` tests still pass
3. `pnpm turbo build && pnpm turbo test` — green

### Invariants

1. The fixture is game-agnostic — no FITL or Texas Hold'em logic
2. No production source code created or modified
3. Tests use the `discoverChoices` override pattern from existing `decision-expansion.test.ts`
4. Test names clearly describe the `chooseN` scenario being tested

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-expansion-choosen.test.ts` — all 10 tests as described above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-expansion-choosen"` (targeted)
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-expansion"` (regression)
3. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test`
