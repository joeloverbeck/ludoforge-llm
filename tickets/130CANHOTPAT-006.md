# 130CANHOTPAT-006: GameState shape consistency property test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — new test file
**Deps**: `archive/tickets/130CANHOTPAT-001.md`

## Problem

After ticket 001 makes all GameState optional fields always-present, there is no automated test verifying that this invariant holds across different game configurations. Future changes could re-introduce conditional properties without detection. A property-based test ensures all GameState objects have identical `Object.keys()` regardless of which features a game uses (Foundation 16: Testing as Proof).

## Assumption Reassessment (2026-04-13)

1. GameState defined in `packages/engine/src/kernel/types-core.ts:1080-1100` — confirmed
2. After ticket 001, all 4 previously-optional fields will be always-present — assumed (dependency)
3. FITL game definition exercises all optional features (reveals, global markers, lasting effects, interrupt stack) — available as test fixture
4. The engine has multiple game configurations in test fixtures that exercise different feature subsets — confirmed

## Architecture Check

1. A property-based test that asserts `Object.keys()` consistency is a direct proof of the V8 hidden class invariant — if all GameState objects have identical keys, they share a single hidden class.
2. Engine-agnostic — the test runs across multiple game configurations without game-specific logic.
3. Foundation 16 compliance — architectural property (shape consistency) proven via automated test.

## What to Change

### 1. Add GameState shape consistency test

Create a test that:

1. Loads multiple game definitions with different feature combinations (e.g., a game with reveals, a game without; a game with lasting effects, a game without)
2. Initializes game state for each
3. Runs several moves to exercise state transitions (optional fields may be populated or remain `undefined` during gameplay)
4. Collects `Object.keys()` from every intermediate GameState
5. Asserts all key sets are identical

```typescript
// Pseudocode
const keySignatures = new Set<string>();
for (const gameDef of testGameDefs) {
  const { state } = initialState(gameDef, seed);
  keySignatures.add(Object.keys(state).sort().join(','));
  // Run a few moves and collect intermediate states
  for (const intermediateState of simulateNMoves(gameDef, state, 10)) {
    keySignatures.add(Object.keys(intermediateState).sort().join(','));
  }
}
assert.strictEqual(keySignatures.size, 1, 
  `GameState has ${keySignatures.size} distinct shapes: ${[...keySignatures].join(' | ')}`);
```

### 2. Choose test location

Place in the engine test suite alongside other architectural property tests. Suggested path: `packages/engine/test/kernel/game-state-shape-consistency.test.ts` (or similar convention matching existing test organization).

## Files to Touch

- `packages/engine/test/kernel/game-state-shape-consistency.test.ts` (new)

## Out of Scope

- Shape consistency tests for other types (EffectCursor, ClassifiedMove, etc.) — can be added as follow-up if needed
- Performance benchmarking — validated via campaign harness
- Fixing GameState optional fields — ticket 001 (this ticket only adds the test)

## Acceptance Criteria

### Tests That Must Pass

1. The new shape consistency test passes
2. All existing engine tests still pass

### Invariants

1. All GameState objects produced across different game configurations have identical `Object.keys()` sets
2. The test exercises at least 2 different game configurations with different feature sets

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/game-state-shape-consistency.test.ts` — property test verifying GameState shape consistency across game configurations

### Commands

1. `pnpm -F @ludoforge/engine test` — run new test + existing suite
2. `pnpm turbo test` — full suite verification
