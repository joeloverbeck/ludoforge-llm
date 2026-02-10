# SPAMOD-008 - Spatial Integration, Property, and Golden Coverage

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-004`, `SPAMOD-005`, `SPAMOD-006`, `SPAMOD-007`

## Goal
Close Spec 07 with end-to-end confidence: integration behavior, deterministic ordering, and topology golden/property assertions.

## Scope
- Add integration coverage for:
  - spatial query + condition evaluation via runtime contexts
  - `moveTokenAdjacent` event emission consumed by trigger dispatch
  - macro-generated topologies passing `validateGameDef` without spatial errors
- Add property tests for deterministic topology/traversal invariants.
- Add golden fixtures/assertions for canonical `grid(3,3)` and `hex(1)` adjacency layouts.

## File List Expected To Touch
- `test/integration/spatial-kernel-integration.test.ts` (new)
- `test/unit/property/spatial.property.test.ts` (new)
- `test/unit/spatial.golden.test.ts` (new)
- `test/fixtures/gamedef/spatial-grid-3x3.json` (new)
- `test/fixtures/gamedef/spatial-hex-1.json` (new)

## Out Of Scope
- New kernel runtime features beyond Spec 07.
- Broad refactors of existing non-spatial integration harnesses.
- Performance benchmarking beyond existing deterministic property loops.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/integration/spatial-kernel-integration.test.ts`
  - `evalQuery` + `evalCondition` spatial operators interoperate in one scenario.
  - `moveTokenAdjacent` emits `tokenEntered` and downstream trigger effects apply.
  - valid macro-expanded topology yields zero spatial diagnostics in `validateGameDef`.
- `test/unit/property/spatial.property.test.ts`
  - generated `grid` and `hex` topologies have symmetric adjacency and valid refs.
  - `connectedZones` output is unique and a subset of all zones.
  - repeated evaluations produce identical ordering.
- `test/unit/spatial.golden.test.ts`
  - exact zone/adjacency snapshot for `grid(3,3)` and `hex(1)`.
- `npm test`

## Invariants That Must Remain True
- Same input game/state/seed yields identical spatial query and trigger outcomes.
- Golden snapshots fail on meaningful ordering/topology regressions.
- Property tests are deterministic and do not rely on ambient randomness.

