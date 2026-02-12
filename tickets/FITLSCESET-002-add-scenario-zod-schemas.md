# FITLSCESET-002: Add Scenario Zod Schemas

**Status**: Pending
**Priority**: P0
**Depends on**: FITLSCESET-001
**Blocks**: FITLSCESET-003

## Summary

Add Zod schemas for the extended scenario payload types to `src/kernel/schemas.ts`. These schemas will be used by the validator (FITLSCESET-003) to validate scenario data assets at parse time.

## Detailed Description

Currently `schemas.ts` has no scenario-related Zod schemas. Add schemas that mirror the TypeScript interfaces from FITLSCESET-001:

1. **`ScenarioPiecePlacementSchema`** — validates a single piece placement entry
2. **`ScenarioDeckCompositionSchema`** — validates deck composition structure
3. **`ScenarioPayloadSchema`** — validates the full scenario payload

Key validation rules encoded in schemas:
- `usPolicy` must be one of `'jfk' | 'lbj' | 'nixon'`
- `count` fields must be positive integers (`z.number().int().positive()`)
- `pileCount`, `eventsPerPile`, `coupsPerPile` must be positive integers
- `side` in `startingCapabilities` must be `'unshaded' | 'shaded'`
- `status` on placements is `z.record(z.string(), z.string()).optional()`
- All array fields that are optional should default to undefined (not empty arrays)

The schemas should follow the existing `OBJECT_STRICTNESS_POLICY` pattern (`.strict()` on all object schemas).

## Files to Touch

| File | Change |
|------|--------|
| `src/kernel/schemas.ts` | Add `ScenarioPiecePlacementSchema`, `ScenarioDeckCompositionSchema`, `ScenarioPayloadSchema`; export them |

## Out of Scope

- TypeScript interfaces (FITLSCESET-001)
- Validator logic in `validate-spec.ts` (FITLSCESET-003)
- Scenario data assets
- Cross-reference validation (space IDs, piece types exist) — that's validator logic, not schema
- Any test files

## Acceptance Criteria

### Tests That Must Pass

- `npm run typecheck` passes
- `npm test` — all existing tests pass
- A new unit test in `test/unit/schemas-scenario.test.ts` verifying:
  - Valid scenario payload parses successfully
  - Missing required fields (`mapAssetId`, `pieceCatalogAssetId`, `scenarioName`, `yearRange`) cause parse failure
  - Invalid `usPolicy` value (e.g. `'fdr'`) causes parse failure
  - Invalid `side` in capabilities (e.g. `'both'`) causes parse failure
  - Negative `count` in placements causes parse failure
  - Extra unknown fields are rejected (strict mode)

### Invariants That Must Remain True

- All existing schemas unchanged
- `OBJECT_STRICTNESS_POLICY` pattern followed
- Schemas are consistent with TypeScript types from FITLSCESET-001
- No runtime behavior changes to existing code paths
