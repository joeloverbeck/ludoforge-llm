# KERCONVALQUEEVA-004 - OptionsQuery Evaluation and Bounds Guard

**Status**: TODO

## Goal
Implement query evaluation for all base query forms and enforce global cardinality bounds.

## Scope
- Add `evalQuery(query, ctx)` support for:
  - `tokensInZone`
  - `intsInRange`
  - `enums`
  - `players`
  - `zones`
- Add boundedness enforcement (`ctx.maxQueryResults ?? 10_000`) for every query path.
- Add explicit spatial stubs for:
  - `adjacentZones`
  - `tokensInAdjacentZones`
  - `connectedZones`
  returning `SPATIAL_NOT_IMPLEMENTED`.

## File List Expected To Touch
- `src/kernel/eval-query.ts`
- `src/kernel/index.ts`
- `test/unit/eval-query.test.ts`

## Out Of Scope
- Spatial query implementation details beyond the required typed stub.
- Aggregate math over query results.
- Effect execution and loop integration.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-query.test.ts`:
  - `tokensInZone('deck:none')` returns state container order.
  - `intsInRange(1,5)` => `[1,2,3,4,5]`; `(3,3)` => `[3]`; `(5,3)` => `[]`.
  - `enums([...])` echoes provided values.
  - `players` returns ascending IDs.
  - `zones({ owner: 'actor' })` filters + lexicographically sorts zone IDs.
  - each spatial query type throws `SPATIAL_NOT_IMPLEMENTED`.
  - oversized result (for example large `intsInRange`) throws `QUERY_BOUNDS_EXCEEDED`.
- Existing tests remain green:
  - `test/unit/smoke.test.ts`

### Invariants That Must Remain True
- No query returns more than configured `maxQueryResults`.
- Query operations are pure and do not mutate zone token arrays.
- Deterministic ordering rules are preserved (`players` sorted; zones sorted; `tokensInZone` in-state order).
