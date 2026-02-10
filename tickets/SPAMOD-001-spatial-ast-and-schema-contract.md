# SPAMOD-001 - Spatial AST and Schema Contract Patch

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: None

## Goal
Add the missing spatial operators and query options to the kernel type/schema contract so runtime code can implement Spec 07 without `any` escapes or schema drift.

## Scope
- Extend `ConditionAST` with:
  - `adjacent` (`left: ZoneSel`, `right: ZoneSel`)
  - `connected` (`from: ZoneSel`, `to: ZoneSel`, optional `via`, optional `maxDepth`)
- Extend `OptionsQuery` for `connectedZones` with optional traversal options:
  - `includeStart?: boolean`
  - `maxDepth?: number`
- Mirror those deltas in Zod schemas.
- Update exhaustive type-guard tests for new condition variants.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
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

