# KERCONVALQUEEVA-004 - OptionsQuery Evaluation and Bounds Guard

**Status**: ✅ COMPLETED

## Goal
Add runtime `evalQuery(query, ctx)` evaluation for `OptionsQuery` variants in the kernel, including boundedness checks and spatial stubs.

## Reassessed Assumptions (Code/Test Reality)
- `OptionsQuery` already includes all five base forms and three spatial forms in `src/kernel/types.ts`.
- Query parsing/validation schemas already include those forms in `src/kernel/schemas.ts`.
- There is no existing `src/kernel/eval-query.ts` module yet.
- There is no existing `test/unit/eval-query.test.ts` yet.
- Kernel exports do not currently expose `evalQuery` via `src/kernel/index.ts`.

## Updated Scope
- Add new module: `src/kernel/eval-query.ts`.
- Implement `evalQuery(query, ctx)` support for:
  - `tokensInZone`
  - `intsInRange`
  - `enums`
  - `players`
  - `zones`
- Enforce boundedness for every query path using `ctx.maxQueryResults ?? 10_000`.
- Add explicit spatial stubs for:
  - `adjacentZones`
  - `tokensInAdjacentZones`
  - `connectedZones`
  returning `SPATIAL_NOT_IMPLEMENTED`.
- Export `evalQuery` from `src/kernel/index.ts`.
- Add unit tests in `test/unit/eval-query.test.ts`.

## File List Expected To Touch
- `tickets/KERCONVALQUEEVA-004-options-query-evaluation.md`
- `src/kernel/eval-query.ts` (new)
- `src/kernel/index.ts`
- `test/unit/eval-query.test.ts` (new)

## Out Of Scope
- Spatial query implementation details beyond the required typed stub.
- Aggregate math over query results (`evalValue` aggregates handled in separate ticket).
- Effect execution and loop integration.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-query.test.ts`:
  - `tokensInZone('deck:none')` returns state container order.
  - `intsInRange(1,5)` => `[1,2,3,4,5]`; `(3,3)` => `[3]`; `(5,3)` => `[]`.
  - `enums([...])` echoes provided values.
  - `players` returns ascending IDs.
  - `zones({ owner: 'actor' })` filters and lexicographically sorts zone IDs.
  - each spatial query type throws `SPATIAL_NOT_IMPLEMENTED`.
  - oversized result throws `QUERY_BOUNDS_EXCEEDED`.
  - query evaluation does not mutate state zone token arrays.
- Existing tests remain green:
  - `test/unit/smoke.test.ts`
  - selector/reference-related suites that consume kernel exports.

### Invariants That Must Remain True
- No query returns more than configured `maxQueryResults`.
- Query operations are pure and do not mutate zone token arrays.
- Deterministic ordering rules are preserved (`players` sorted; zones sorted; `tokensInZone` in-state order).

## Outcome
- Completion date: February 10, 2026.
- Actually changed:
  - Added `evalQuery` implementation in `src/kernel/eval-query.ts` for all base query forms from Spec 04.
  - Added boundedness guard (`QUERY_BOUNDS_EXCEEDED`) on every query path using `maxQueryResults` defaulting to 10,000.
  - Added spatial stubs for `adjacentZones`, `tokensInAdjacentZones`, and `connectedZones` returning `SPATIAL_NOT_IMPLEMENTED`.
  - Exported `evalQuery` from `src/kernel/index.ts`.
  - Added unit coverage in `test/unit/eval-query.test.ts` for ordering, bounds, spatial stubs, and mutation-safety.
- Deviations from original plan:
  - The originally assumed files did not exist; work was implemented as new files and a new export in current module layout.
- Verification results:
  - `npm test` passed (includes build + unit + integration).
