# SPAMOD-005 - Spatial Condition Runtime (`adjacent`, `connected`)

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`, `SPAMOD-002`, `SPAMOD-003`, `SPAMOD-004`

## Goal
Implement spatial condition operators in `evalCondition` using the same normalized graph semantics as spatial queries.

## Scope
- Add `adjacent` condition evaluation:
  - resolve both zone selectors to exactly one zone
  - return true iff right is in left neighbor set
- Add `connected` condition evaluation:
  - resolve `from`/`to` to single zones
  - evaluate reachability using `connectedZones` traversal semantics
  - support optional `via` and `maxDepth`
- Add focused condition coverage tests.

## File List Expected To Touch
- `src/kernel/eval-condition.ts`
- `src/kernel/spatial.ts`
- `test/unit/eval-condition.test.ts`
- `test/unit/spatial-conditions.test.ts` (new)

## Out Of Scope
- Query implementation details already covered by `SPAMOD-004` except shared helper reuse.
- Effect runtime (`moveTokenAdjacent`).
- `validateGameDef` spatial diagnostics.
- CNL macro expansion.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/spatial-conditions.test.ts`
  - `adjacent` true and false cases.
  - `connected` true and false cases.
  - `connected` with `via` filter pass/fail behavior.
  - `connected` with `maxDepth` boundary behavior.
- `test/unit/eval-condition.test.ts`
  - legacy logical/comparison/membership behavior remains intact.
- `npm test`

## Invariants That Must Remain True
- Condition evaluation remains deterministic and side-effect free.
- Spatial condition semantics match `queryConnectedZones` reachability semantics.
- Existing non-spatial condition operators produce unchanged results.

