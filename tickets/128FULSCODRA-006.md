# 128FULSCODRA-006: Property-based tests for draft/spread equivalence and probe path verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel test infrastructure
**Deps**: `tickets/128FULSCODRA-003.md`, `tickets/128FULSCODRA-004.md`, `tickets/128FULSCODRA-005.md`

## Problem

Spec 128 (Constraint 3, Foundation 16) requires property-based tests proving that the draft-based path produces identical results to the former spread-based path, and that input state is never modified. Without these tests, the architectural invariant (draft mutations are invisible to callers) is assumed, not proven. Additionally, `probeMoveViability` must be verified as unaffected by the draft scope changes.

## Assumption Reassessment (2026-04-13)

1. `probeMoveViability` at `apply-move.ts:1821` is a pure read-only validation probe — does not call `applyMoveCore`. Confirmed.
2. `freezeState` at `state-draft.ts:77-79` is a zero-cost type cast. The "frozen" state can still be mutated at the JS level — only TypeScript prevents it. Property tests should use `Object.freeze` (deep) to verify no mutation occurs. Confirmed.
3. Existing test infrastructure uses Node.js built-in test runner. Property-based tests can use `node:test` with manual random generation (no external library dependency needed). Confirmed.
4. `computeFullHash` returns `bigint` — determinism verification compares hash values. Confirmed.

## Architecture Check

1. Property-based testing is the gold standard for proving equivalence between two implementations (Foundation 16). These tests will survive future refactoring — if anyone accidentally introduces mutation leakage, the deep-freeze test catches it.
2. No game-specific logic — tests operate on generic GameState with randomized field values.
3. No backwards-compatibility shims — this is pure test infrastructure.

## What to Change

### 1. Draft/spread equivalence property test

Create a property-based test that:
1. Generates a random `GameState` with randomized field values (zones, vars, markers, etc.)
2. Generates a random sequence of legal moves
3. Applies the moves via `applyMove` (which now uses draft path internally)
4. Compares the resulting `stateHash` against a reference run
5. Asserts bit-identical results across multiple seeds

The reference comparison leverages existing determinism tests — the key property is that the draft-based system produces the same stateHash as the pre-conversion system. Since the conversion is already done, this test verifies ongoing determinism by running multiple seeds and asserting consistency.

### 2. Input state immutability property test

Create a test that:
1. Creates a `GameState`
2. Deep-freezes it with `Object.freeze` (recursive)
3. Calls `applyMove(def, frozenState, move)`
4. Asserts no `TypeError` was thrown (which `Object.freeze` would cause if mutation occurred)
5. Asserts `frozenState` is structurally unchanged (reference equality on all nested objects)

### 3. Probe path isolation verification

Add tests verifying:
1. `probeMoveViability` does not modify the input state (deep-freeze + call + assert no throw)
2. `probeMoveViability` returns consistent results regardless of whether `applyMoveCore` has been called before (no shared mutable state leaking between paths)

### 4. Multi-seed determinism verification

Run the FITL game simulation across 3+ seeds, each 3+ times, asserting stateHash consistency. This extends existing determinism tests to cover the post-conversion state.

## Files to Touch

- `packages/engine/test/kernel/state-draft-equivalence.test.ts` (new)
- `packages/engine/test/kernel/apply-move-immutability.test.ts` (new)

## Out of Scope

- Performance benchmarking (ticket 007)
- Converting any additional spread sites
- Modifying kernel production code

## Acceptance Criteria

### Tests That Must Pass

1. Property test: 100 random seeds produce bit-identical stateHash across repeated runs
2. Immutability test: deep-frozen input state survives `applyMove` without `TypeError`
3. Probe isolation test: `probeMoveViability` does not modify input state
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): proven by property-based testing across random seeds
2. Foundation 11 (Immutability — external contract): proven by deep-freeze input test
3. Foundation 16 (Testing as Proof): architectural properties verified by automated tests

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/state-draft-equivalence.test.ts` — property-based determinism verification
2. `packages/engine/test/kernel/apply-move-immutability.test.ts` — deep-freeze input immutability proof

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "draft-equivalence|immutability"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build && pnpm turbo test`
