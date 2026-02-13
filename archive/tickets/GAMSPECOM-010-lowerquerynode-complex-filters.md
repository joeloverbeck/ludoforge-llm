# GAMSPECOM-010: Support Complex Filters in lowerQueryNode

**Status**: COMPLETED
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: N/A (compiler infrastructure gap discovered during FITLOPEFULEFF-005)
**Depends on**: None

## Summary

The compiler's `lowerQueryNode` in `src/cnl/compile-conditions.ts` silently drops complex filters on `zones` and `tokensInZone` queries. Only `zones` queries with `filter: { owner: <PlayerSel> }` are lowered; all other filter forms — including arbitrary `ConditionAST` filters and token property filters — are silently discarded. This means the compiled `GameDef` does not enforce rule-mandated restrictions at the selection/iteration level.

## Problem

### Affected query types

1. **`zones` query** (lines 276-294): Only handles `filter: { owner: <PlayerSel> }`. When the filter is a `ConditionAST` (e.g., `{ op: 'and', args: [...] }` with spaceType checks and control exclusions), the handler hits `source.filter.owner === undefined` at line 283 and returns `{ query: 'zones' }` with **no filter at all** — no diagnostic, no warning.

2. **`tokensInZone` query** (lines 243-251): Completely ignores any `filter` property. Returns `{ query: 'tokensInZone', zone: <zone> }` regardless of whether the YAML specifies token property filters like `[{ prop: 'type', eq: 'rangers' }, { prop: 'faction', eq: 'ARVN' }]`.

### Impact on game execution

Without filters in the compiled GameDef:
- `chooseN` options present **all** zones/tokens instead of the filtered subset — players/agents see illegal choices
- `forEach` iterates over **unfiltered** sets — effects apply to wrong targets
- `aggregate` counts return **total** counts instead of type-specific counts — conditions evaluate incorrectly (e.g., pacification check can't distinguish troops from police)

### Profiles affected

Every operation profile using complex filters is affected. Known examples from FITL:
- **Space selection**: NVA Control exclusion, province/city type filters
- **Token placement**: Rangers vs. troops type filters on `tokensInZone`
- **Pacification condition**: Separate ARVN troops and ARVN police counts via filtered aggregates
- **COIN base detection**: Token type+faction filter on `tokensInZone` inside aggregate

## Files to Touch

- `src/cnl/compile-conditions.ts` — Extend `lowerQueryNode` for `zones` and `tokensInZone` cases
- `src/kernel/types.ts` — Extend `OptionsQuery` type to carry filter ASTs (if not already supported)
- `test/unit/compile-conditions.test.ts` — Add tests for complex filter lowering
- `test/integration/fitl-coin-operations.test.ts` — Update AC2/AC4/AC5/AC6 tests to verify compiled AST filters (currently they verify at parsed YAML level as a workaround)

## Proposed Approach

### For `zones` query filters

The parsed YAML already produces well-formed `ConditionAST` objects in the filter position (via the existing condition parser). The lowering should:

1. Detect when `source.filter` is a `ConditionAST` (has `op` property) rather than `{ owner: <PlayerSel> }`
2. Lower the filter through `lowerCondition()` to produce a compiled `ConditionAST`
3. Attach it to the compiled query: `{ query: 'zones', filter: <ConditionAST> }`
4. Preserve the existing `{ owner: <PlayerSel> }` path as-is for backward compatibility

### For `tokensInZone` query filters

Token property filters use a different shape: `Array<{ prop: string, eq?: string, op?: string, value?: unknown }>`. The lowering should:

1. Detect `source.filter` array on `tokensInZone` queries
2. Validate and lower each filter entry
3. Attach to compiled query: `{ query: 'tokensInZone', zone: <zone>, filter: [...] }`

### Kernel changes

The kernel's `legalMoves` enumeration and `forEach` iteration must respect the new filter fields. This may require changes in:
- `enumerateOptions()` — apply zone/token filters when building choice sets
- `executeForEach()` — filter iteration targets

## Acceptance Criteria

1. `zones` query with `ConditionAST` filter compiles to GameDef with filter preserved
2. `tokensInZone` query with property filter array compiles to GameDef with filter preserved
3. No silent dropping — if a filter form is unsupported, emit a diagnostic
4. Existing `zones` + `{ owner: <PlayerSel> }` path still works
5. Build passes, typecheck passes, all existing tests pass
6. Integration tests for train-arvn-profile AC2/AC4/AC5/AC6 updated to verify compiled AST filters

## Out of Scope

- Kernel runtime enforcement of the new filters (separate ticket if needed)
- New filter operators beyond what YAML profiles already use
- Performance optimization of filtered enumeration

## Discovery Context

Found during FITLOPEFULEFF-005 (train-arvn-profile). Tests AC2, AC4, AC5, AC6 had to be written against the **parsed YAML** instead of the compiled GameDef because the compiler drops their filters. The workaround verifies correctness at the YAML level, but the compiled GameDef remains incomplete.

## Outcome

**Completion date**: 2026-02-13

**What was changed**:
- `src/kernel/types.ts`: Extended `OptionsQuery` zones filter to `{ owner?: PlayerSel; condition?: ConditionAST }` and `TokenFilterPredicate.value` to `ValueExpr | readonly string[]`
- `src/kernel/schemas.ts`: Updated Zod schemas for new filter shapes
- `src/cnl/compile-conditions.ts`: Added `lowerTokenFilterEntry`/`lowerTokenFilterArray` helpers; fixed `tokensInZone`, `tokensInAdjacentZones`, and `zones` cases to lower complex filters instead of silently dropping them
- `src/kernel/eval-query.ts`: Added `resolveFilterValue` helper, updated `tokenMatchesPredicate`/`applyTokenFilters` to resolve `ValueExpr` references at runtime via `evalValue()`
- `src/kernel/validate-gamedef.ts`: Added `validateTokenFilterPredicates` helper, zones `condition` validation
- `test/unit/compile-conditions.test.ts`: 8 new unit tests (22 total)
- `test/integration/fitl-coin-operations.test.ts`: AC2/AC4/AC5/AC6 updated to verify compiled AST filters

**Deviations from plan**:
- Kept `owner` as first-class zones filter concept (not backward compat — it's semantically meaningful), extended with `condition` field
- Kernel runtime enforcement was done in this ticket (not deferred) — `resolveFilterValue` resolves `ValueExpr` values in token predicates

**Verification**: 1019/1019 tests pass, build clean, lint clean
