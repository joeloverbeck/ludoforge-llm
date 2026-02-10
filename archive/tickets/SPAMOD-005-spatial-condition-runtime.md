# SPAMOD-005 - Spatial Condition Runtime (`adjacent`, `connected`)

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`, `SPAMOD-002`, `SPAMOD-003`, `SPAMOD-004`

## Goal
Implement spatial condition operators in `evalCondition` by reusing the existing normalized graph/query traversal semantics already implemented in `src/kernel/spatial.ts`.

## Reassessed Assumptions
- `queryConnectedZones` traversal semantics are already implemented and covered in `test/unit/spatial-queries.test.ts`.
- `resolveSingleZoneSel` already enforces the "exactly one concrete zone" cardinality requirement for zone selectors.
- Current discrepancy is localized to `evalCondition`: spatial conditions still throw `SPATIAL_NOT_IMPLEMENTED`, and tests currently codify that legacy behavior.

## Scope
- Add `adjacent` condition evaluation in `evalCondition`:
  - resolve both zone selectors to exactly one zone via existing selector runtime
  - return true iff right is in left normalized neighbor set
- Add `connected` condition evaluation in `evalCondition`:
  - resolve `from`/`to` to single zones via existing selector runtime
  - evaluate reachability using existing `queryConnectedZones` semantics
  - support optional `via` and `maxDepth`
- Update/expand condition tests to validate the new runtime behavior and preserve legacy non-spatial behavior.

## File List Expected To Touch
- `src/kernel/eval-condition.ts`
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
  - no longer expects `SPATIAL_NOT_IMPLEMENTED` for `adjacent`/`connected`.
- `npm test`

## Invariants That Must Remain True
- Condition evaluation remains deterministic and side-effect free.
- Spatial condition semantics match `queryConnectedZones` reachability semantics.
- Existing non-spatial condition operators produce unchanged results.

## Outcome
- Completion date: 2026-02-10
- Implemented `adjacent` and `connected` branches in `evalCondition` using existing selector resolution and `queryConnectedZones` traversal semantics.
- Updated `test/unit/eval-condition.test.ts` to remove the obsolete expectation that spatial conditions throw `SPATIAL_NOT_IMPLEMENTED`.
- Added `test/unit/spatial-conditions.test.ts` to cover:
  - `adjacent` true/false
  - `connected` true/false
  - `connected` `via` pass/fail
  - `connected` `maxDepth` boundary behavior
- Deviation from original plan: did not modify `src/kernel/spatial.ts` because required traversal behavior already existed and was reused directly.
- Verification: `npm test` passes.
