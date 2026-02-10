# SPAMOD-001 - Spatial AST and Schema Contract Patch

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: None

## Goal
Add the missing spatial operators and query options to the kernel type/schema contract so runtime code can implement Spec 07 without `any` escapes or schema drift.

## Assumptions Reassessed
- `ConditionAST` currently does **not** include spatial operators (`adjacent`, `connected`).
- `OptionsQuery.connectedZones` currently does **not** include traversal options (`includeStart`, `maxDepth`).
- `test/unit/schemas-ast.test.ts` currently validates selector/effect payloads, but does **not** directly exercise `ConditionASTSchema` / `OptionsQuerySchema` spatial payloads.
- `test/unit/types-exhaustive.test.ts` currently has no dedicated `ConditionAST` exhaustiveness helper/count assertion.
- Adding new `ConditionAST` variants requires minimal compile-safety branch updates in:
  - `src/kernel/eval-condition.ts`
  - `src/kernel/validate-gamedef.ts`
  even though spatial runtime behavior remains out of scope.

## Scope
- Extend `ConditionAST` with:
  - `adjacent` (`left: ZoneSel`, `right: ZoneSel`)
  - `connected` (`from: ZoneSel`, `to: ZoneSel`, optional `via`, optional `maxDepth`)
- Extend `OptionsQuery` for `connectedZones` with optional traversal options:
  - `includeStart?: boolean`
  - `maxDepth?: number`
- Mirror those deltas in Zod schemas.
- Update exhaustive type-guard tests for new condition variants.
- Keep non-spatial runtime behavior unchanged; for new condition operators, maintain current \"spatial not implemented\" runtime stance.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/eval-condition.ts`
- `src/kernel/validate-gamedef.ts`
- `test/unit/types-exhaustive.test.ts`
- `test/unit/schemas-ast.test.ts`

## Out Of Scope
- Runtime implementation of adjacency graph traversal.
- `evalCondition` and `evalQuery` behavior changes.
- `moveTokenAdjacent` effect runtime.
- GameDef validation diagnostics.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-ast.test.ts`
  - accepts valid `adjacent` and `connected` condition payloads.
  - accepts `connectedZones` with/without `includeStart` and `maxDepth`.
  - rejects malformed payloads (wrong field names/types).
- `test/unit/types-exhaustive.test.ts`
  - exhaustiveness checks compile and include the new condition variants.
- `npm run typecheck`

## Invariants That Must Remain True
- Existing non-spatial AST schema behavior is unchanged.
- Runtime schema strictness stays `strict` (no unknown keys accepted).
- `types.ts` and `schemas.ts` remain isomorphic for spatial condition/query shapes.

## Outcome
- **Completion date**: 2026-02-10
- **What changed vs plan**:
  - Implemented planned contract deltas in `ConditionAST` and `OptionsQuery.connectedZones` (`includeStart`, `maxDepth`) in both `types.ts` and `schemas.ts`.
  - Added the planned schema and exhaustiveness tests in `test/unit/schemas-ast.test.ts` and `test/unit/types-exhaustive.test.ts`.
  - Added minimal compile-safety/runtime-stub alignment updates not originally listed but required by the reassessment:
    - `src/kernel/eval-condition.ts` now explicitly handles `adjacent`/`connected` with `SPATIAL_NOT_IMPLEMENTED`.
    - `src/kernel/validate-gamedef.ts` now validates zone selectors for `adjacent`/`connected` condition nodes.
  - Added one focused regression test in `test/unit/eval-condition.test.ts` to pin intended non-implementation behavior for new spatial condition ops.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run test` passed.
