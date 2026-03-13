# DECINSARC-006: Migrate test helpers and all engine tests to DecisionKey

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — test helpers, test files across unit/integration/e2e
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-003, DECINSARC-004, DECINSARC-005

## Problem

`decision-param-helpers.ts` (216 lines) reconstructs canonical keys from multiple occurrence fields, mirroring runtime serialization logic. After the type changes, all tests constructing `ChoicePendingRequest` with old occurrence fields or using old helper functions will fail to compile. This ticket migrates the entire test suite.

## Assumption Reassessment (2026-03-13)

1. `decision-param-helpers.ts` imports `createDecisionOccurrenceContext`, `consumeDecisionOccurrence` from `decision-occurrence.ts` — confirmed, must be rewritten to use codec.
2. `normalizeDecisionParamsForMove()` in helpers uses a 6-step fallback chain to match input hints to canonical decision ids — confirmed, replace with direct `DecisionKey` usage.
3. Many test files construct `ChoicePendingRequest` objects with old occurrence fields — need comprehensive grep to find all instances.
4. FITL integration tests and e2e tests use `decision-param-helpers` heavily — confirmed.
5. Canonical `DecisionKey` serialization is shape-sensitive: true simple static binds collapse to raw keys like `$target`, while templated authored decision ids remain `decision:...::resolvedBind` — confirmed by the current codec and must be reflected in migrated tests/helpers.

## Architecture Check

1. Test helpers using codec directly means tests verify the same serialization path as production code — no drift possible.
2. Massive simplification: `normalizeDecisionParamsForMove` can be drastically simplified or eliminated since params are now keyed by `DecisionKey`.
3. Tests should validate codec correctness, not re-implement it.

## What to Change

### 1. Rewrite `packages/engine/test/helpers/decision-param-helpers.ts`

- Remove imports of `createDecisionOccurrenceContext`, `consumeDecisionOccurrence`, `DecisionOccurrenceContext`, `resolveMoveParamForDecisionOccurrence`, `writeMoveParamForDecisionOccurrence`
- Import `DecisionKey`, `formatDecisionKey`, `parseDecisionKey`, `advanceScope`, `emptyScope` from `decision-scope.ts`
- `normalizeDecisionParamsForMove()`: simplify to operate on `DecisionKey`-keyed params directly. If the helper still needs to map user-friendly bind names to canonical keys, use `parseDecisionKey()`.
- `applyMoveWithResolvedDecisionIds()`: simplify — compound special activity params should already use `DecisionKey`

### 2. Update all test files constructing `ChoicePendingRequest`

- Grep for `decisionId:`, `occurrenceIndex:`, `occurrenceKey:`, `nameOccurrenceIndex:`, `nameOccurrenceKey:`, `canonicalAlias:`, `canonicalAliasOccurrenceIndex:`, `canonicalAliasOccurrenceKey:` in test files
- Replace with single `decisionKey: formatDecisionKey(...)` or appropriate `DecisionKey` string
- Keep `name` field for display name assertions

### 3. Update test fixtures constructing move params

- Any test that manually constructs `move.params` with old-style keys (occurrence keys, name keys, alias keys) must use `DecisionKey` strings instead

### 4. Add regression tests

Dedicated regressions for previously observed issues:
- Repeated decision collapse (same bind, different occurrence → different `DecisionKey`)
- Branch contamination during stochastic discovery (immutability proof)
- Cross-call occurrence leakage (fresh `emptyScope()` per top-level call)
- Helper canonicalization drift (test helpers produce same keys as runtime)

### 5. Add property tests

- For any decision sequence, canonical serialization is stable given same resolution path
- No two distinct decision instances collide to the same serialized key

## Files to Touch

- `packages/engine/test/helpers/decision-param-helpers.ts` (modify — major rewrite)
- `packages/engine/test/unit/kernel/effects-choice.test.ts` (modify — update `ChoicePendingRequest` assertions)
- `packages/engine/test/unit/kernel/effects-control.test.ts` (modify — update forEach assertions)
- `packages/engine/test/unit/kernel/effect-dispatch.test.ts` (modify — scope threading assertions)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify — update param assertions)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify — update discovery assertions)
- `packages/engine/test/integration/` — any integration tests using old occurrence fields (modify)
- `packages/engine/test/e2e/` — any e2e tests using old helpers (modify)
- Any other test files found by grep (modify)

## Out of Scope

- Modifying engine source files (all done in DECINSARC-001 through DECINSARC-005)
- Modifying runner code (DECINSARC-007)
- Modifying runner tests (DECINSARC-008)
- Adding new engine features or game-specific test data
- Changing FITL game spec data files

## Acceptance Criteria

### Tests That Must Pass

1. Full engine unit test suite: `pnpm -F @ludoforge/engine test`
2. Full engine e2e test suite: `pnpm -F @ludoforge/engine test:e2e`
3. Full engine test suite: `pnpm -F @ludoforge/engine test:all`
4. FITL stress cases pass:
   - `card-80` repeated destination prompts remain fully addressable
   - At least two other repeated/nested FITL events remain stable
5. Regression tests pass:
   - Repeated decision collapse test
   - Branch contamination test
   - Cross-call leakage test
   - Helper canonicalization test
6. Property tests pass:
   - Canonical serialization stability
   - No key collision
7. Build passes: `pnpm turbo build`
8. Typecheck passes: `pnpm turbo typecheck`
9. Lint passes: `pnpm turbo lint`

### Invariants

1. Test helpers use codec functions exclusively — no hand-crafted key strings.
2. No test file references `DecisionOccurrenceContext`, `DecisionOccurrence`, or any symbol from deleted `decision-occurrence.ts`.
3. No test file references `composeScopedDecisionId` or `extractResolvedBindFromDecisionId` from deleted `decision-id.ts`.
4. All `ChoicePendingRequest` assertions use `decisionKey` field, not old occurrence fields.
5. Tests validate behavior, not implementation details of old occurrence tracking.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-scope.test.ts` — add regression and property tests (supplement DECINSARC-001 tests)
2. `packages/engine/test/helpers/decision-param-helpers.ts` — rewritten helper
3. All test files with `ChoicePendingRequest` assertions — updated
4. Integration tests for repeated/nested/stochastic decisions — updated assertions

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test:all`
3. `pnpm turbo typecheck && pnpm turbo lint`
