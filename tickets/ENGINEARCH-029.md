# ENGINEARCH-029: Add full negative contract matrix tests for transfer/resource endpoint scope-field rules

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests and contract validation coverage
**Deps**: ENGINEARCH-028

## Problem

Endpoint scope/field validation was expanded, but coverage is currently partial. Key invalid combinations are not yet exhaustively locked down in tests, which increases regression risk when endpoint contracts evolve.

## Assumption Reassessment (2026-02-25)

1. Current tests cover selected zone-endpoint scenarios but not a complete invalid-combination matrix.
2. Validator and schema layers each enforce part of the endpoint rules, but cross-layer regression coverage is incomplete.
3. **Mismatch + correction**: implementation includes strict checks, but test coverage does not yet prove all required/forbidden combinations.

## Architecture Check

1. Contract-matrix tests improve robustness by preventing future drift between compiler, schema, and runtime validation layers.
2. This is game-agnostic quality hardening; no game-specific branching introduced.
3. No backwards-compatibility behavior retained: tests should assert strict rejection, not fallback acceptance.

## What to Change

### 1. Add validator negative matrix coverage

Add targeted `validate-gamedef` cases for each endpoint branch to assert required/forbidden fields:
- `global`: forbid `player`, forbid `zone`
- `pvar`: require `player`, forbid `zone`
- `zoneVar`: require `zone`, forbid `player`

Cover both `from` and `to` endpoints.

### 2. Add schema negative matrix coverage

Add `json-schema`/AST schema tests asserting invalid endpoint payload combinations fail schema validation.

### 3. Add compiler lowering negative coverage

Ensure CNL lowering rejects invalid endpoint field usage for each scope branch.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)

## Out of Scope

- Runtime execution logic changes
- Schema/type redesign beyond what ENGINEARCH-028 introduces

## Acceptance Criteria

### Tests That Must Pass

1. Full invalid scope-field matrix is explicitly asserted for both transfer endpoints.
2. Compiler/schema/validator all reject the same invalid combinations.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Endpoint contract rejection behavior is deterministic and consistent across validation layers.
2. New endpoint branches cannot be added without updating matrix coverage.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — matrix of required/forbidden fields by scope.
2. `packages/engine/test/unit/json-schema.test.ts` — serialized trace invalid endpoint shape rejection.
3. `packages/engine/test/unit/schemas-ast.test.ts` — AST invalid endpoint shape rejection.
4. `packages/engine/test/unit/compile-effects.test.ts` — CNL lowering rejection for invalid scope-field combinations.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/validate-gamedef test/unit/json-schema test/unit/schemas-ast test/unit/compile-effects`
3. `pnpm -F @ludoforge/engine test`
