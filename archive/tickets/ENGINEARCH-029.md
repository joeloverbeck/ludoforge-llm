# ENGINEARCH-029: Close remaining negative-matrix gaps for transfer/resource endpoint scope-field rules

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only (contract hardening coverage)
**Deps**: ENGINEARCH-028

## Problem

ENGINEARCH-028 tightened endpoint contracts, but test coverage is still uneven across layers. Some negative combinations are tested, but not as a complete matrix across both endpoint sides (`from` and `to`) and both schema families (`GameDef.transferVar`, `Trace.resourceTransfer`).

## Assumption Reassessment (2026-02-25)

1. `EffectAST` contracts already encode discriminated `transferVar` endpoint rules, and `schemas-ast` already contains partial negative tests.
2. Trace contracts already encode discriminated `resourceTransfer` endpoint rules, and `json-schema` has one negative drift test.
3. `compile-effects` lowering enforces required/forbidden endpoint fields at compile time but only has positive-path tests today.
4. **Mismatch + correction**: `validate-gamedef` behavior validation intentionally does not own transfer endpoint structural checks; those checks are contract-level (schema/AST/lowering) responsibilities.
5. **Mismatch + correction**: the remaining gap is matrix completeness and parity across schema/AST/lowering surfaces, not new validator logic.

## Architecture Check

1. Completing negative matrices is beneficial because the architecture already chose strict discriminated contracts; broad matrix tests lock that decision against regression.
2. This is game-agnostic quality hardening only; no gameplay/runtime behavior changes and no aliases/shims.
3. Robustness comes from enforcing one source of truth: structure at schema/AST/lowering boundaries, semantic meaning in behavior validation.

## What to Change

### 1. Expand AST/schema negative matrix coverage

Extend `schemas-ast` tests to cover missing/forbidden fields across both `from` and `to` transfer endpoints:
- `global`: forbid `player`, forbid `zone`
- `pvar`: require `player`, forbid `zone`
- `zoneVar`: require `zone`, forbid `player`

### 2. Expand JSON schema negative matrix coverage

Extend `json-schema` tests with matrix-style invalid payloads for:
- `GameDef.transferVar` endpoint shape drift
- `Trace.resourceTransfer` endpoint shape drift

### 3. Expand compiler-lowering negative matrix coverage

Add `compile-effects` tests proving lowering rejects invalid endpoint field usage on both endpoint sides for each scope branch.

## Files to Touch

- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)

## Out of Scope

- Runtime execution logic changes
- Schema/type redesign beyond what ENGINEARCH-028 already introduced
- New `validate-gamedef` structural diagnostics for transfer endpoint shape

## Acceptance Criteria

### Tests That Must Pass

1. Full invalid scope-field matrix is explicitly asserted for both endpoint sides in transfer/resource contracts.
2. AST schema, JSON schemas, and CNL lowering consistently reject invalid required/forbidden field combinations.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Structural endpoint invariants remain owned by schema/AST/lowering layers, with no duplication in behavior validation.
2. Endpoint contract rejection behavior is deterministic and consistent across contract layers.
3. New endpoint branches cannot be added without touching matrix coverage.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/json-schema.test.ts` — matrix invalid endpoint shape rejection for `GameDef.transferVar` and trace `resourceTransfer`.
2. `packages/engine/test/unit/schemas-ast.test.ts` — expanded AST invalid endpoint shape matrix for `from` and `to`.
3. `packages/engine/test/unit/compile-effects.test.ts` — CNL lowering rejection matrix for invalid scope-field combinations.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/json-schema test/unit/schemas-ast test/unit/compile-effects`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed vs originally planned**:
  - Corrected scope to match architecture: transfer endpoint structural validation remains owned by schema/AST/lowering layers, not `validate-gamedef` semantic validation.
  - Added matrix-style negative tests for endpoint required/forbidden field combinations in:
    - `packages/engine/test/unit/schemas-ast.test.ts`
    - `packages/engine/test/unit/json-schema.test.ts` (`GameDef.transferVar` and `Trace.resourceTransfer`)
    - `packages/engine/test/unit/compile-effects.test.ts`
  - Added shared helper `packages/engine/test/helpers/transfer-endpoint-matrix.ts` so all three suites consume one canonical matrix definition, reducing drift risk as endpoint contracts evolve.
  - Did not add new `validate-gamedef` structural tests, because that would duplicate responsibilities intentionally removed in ENGINEARCH-028.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- test/unit/json-schema.test.ts test/unit/schemas-ast.test.ts test/unit/compile-effects.test.ts` passed.
  - `pnpm -F @ludoforge/engine test` passed (278/278).
  - `pnpm -F @ludoforge/engine lint` passed.
