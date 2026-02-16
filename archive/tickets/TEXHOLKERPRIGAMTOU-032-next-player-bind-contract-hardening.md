# TEXHOLKERPRIGAMTOU-032: nextPlayerByCondition Binder Contract Hardening

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-011
**Blocks**: TEXHOLKERPRIGAMTOU-033

## Problem

`nextPlayerByCondition` now uses an explicit `bind`, but schema/runtime-facing validation still permits malformed binders (for example non-canonical binder identifiers). This weakens contract safety for direct `GameDef` inputs and creates avoidable runtime ambiguity.

## Assumption Reassessment (Code/Test Reality)

1. `src/cnl/compile-conditions.ts` already rejects empty/whitespace `nextPlayerByCondition.bind` during CNL lowering (`trim() === ''` guard). The ticket previously implied this gap existed everywhere.
2. `src/kernel/schemas-ast.ts` currently accepts any string for `nextPlayerByCondition.bind` (`StringSchema`), so non-canonical values pass AST/schema parsing.
3. `src/kernel/validate-gamedef-behavior.ts` validates `nextPlayerByCondition.from` and `where`, but does not validate `bind` canonicality.
4. Existing tests cover positive behavior and `from` numeric validation, but do not assert canonical binder enforcement for this query in schema and runtime behavioral validation.

## Updated Scope

1. Keep existing compile-time whitespace guard, and strengthen it to canonical binder enforcement (`$name` contract) with path-local diagnostics.
2. Enforce canonical `nextPlayerByCondition.bind` at AST/schema level and behavioral validation for direct `GameDef` inputs.
3. Add stable, explicit diagnostic codes for invalid `nextPlayerByCondition.bind` in compiler and runtime behavioral validators.
4. Add focused tests for:
   - compiler rejection of malformed/non-canonical binders,
   - schema rejection for non-canonical binders,
   - `validateGameDef` diagnostic code/path correctness for malformed binders.

## 1) What should be added/changed

1. Enforce canonical binder validity for `OptionsQuery.query = "nextPlayerByCondition"` across compiler + schema + behavioral validation surfaces.
2. Reject empty/whitespace binders and non-canonical binder identifiers (follow canonical binding identifier contract used elsewhere).
3. Add explicit diagnostics for invalid query binders with stable reason codes and path-localized errors.
4. Keep kernel/compiler game-agnostic; no game-specific exceptions.

## 2) Invariants that must pass

1. Any `nextPlayerByCondition.bind` accepted by validators is non-empty and canonical.
2. Invalid binders are rejected deterministically with clear diagnostics before simulation.
3. Valid existing usage remains accepted without semantic drift.
4. No aliases/back-compat binder formats are introduced.

## 3) Tests that must pass

1. Add/extend unit tests validating acceptance of canonical binders and rejection of malformed binders for `nextPlayerByCondition`.
2. Add/extend schema tests proving invalid binders fail validation at AST/schema level.
3. Add/extend GameDef validation tests proving diagnostic code/path correctness for invalid binders.
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **What changed**:
  - Enforced canonical `nextPlayerByCondition.bind` (`$name`) in compiler lowering with explicit diagnostic code `CNL_COMPILER_NEXT_PLAYER_BIND_INVALID`.
  - Enforced canonical `nextPlayerByCondition.bind` in AST/schema contracts (`OptionsQuerySchema`) via canonical binding regex.
  - Enforced canonical `nextPlayerByCondition.bind` in runtime behavioral validation (`validateGameDef`) with explicit diagnostic code `DOMAIN_NEXT_PLAYER_BIND_INVALID`.
  - Centralized canonical binding identifier contract into shared kernel constants/helpers and reused it across compiler, schema, and runtime validators.
  - Added focused unit coverage for compiler, schema AST, and GameDef validation surfaces.
  - Added kernel unit coverage for the shared binding identifier contract module.
  - Regenerated schema artifacts (`schemas/GameDef.schema.json`, `schemas/Trace.schema.json`, `schemas/EvalReport.schema.json`).
- **Deviation from original plan**:
  - Clarified that whitespace rejection already existed in compiler lowering and preserved it while adding canonical-form enforcement.
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
