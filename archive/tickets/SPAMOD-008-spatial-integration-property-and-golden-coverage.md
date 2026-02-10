# SPAMOD-008 - Spatial Integration, Property, and Golden Coverage

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-004`, `SPAMOD-005`, `SPAMOD-006`, `SPAMOD-007`

## Goal
Close Spec 07 with end-to-end confidence by adding missing integration/property/golden coverage on top of the existing spatial unit-test base.

## Reassessed Assumptions (2026-02-10)
- Spatial runtime and most unit coverage from Spec 07 are already implemented (`spatial-graph`, `spatial-queries`, `spatial-conditions`, `spatial-effects`, `board-macros`).
- The codebase does not currently include `src/cnl/compiler.ts`; macro validation is exercised through `src/cnl/expand-macros.ts` and `validateGameDef`.
- Existing tests already cover many originally listed acceptance assertions; this ticket should focus only on the remaining gaps:
  - integration of spatial query + condition in one runtime flow
  - integration that verifies `moveTokenAdjacent`-originated `tokenEntered` events participate in trigger dispatch
  - property-style deterministic topology/traversal checks
  - topology golden assertions for canonical `grid(3,3)` and `hex(1)`

## Scope
- Add integration coverage for:
  - spatial query + condition evaluation via runtime contexts
  - `moveTokenAdjacent` event emission consumed by trigger dispatch
  - macro-generated topologies (from `generateGrid` / `generateHex`) passing `validateGameDef` without spatial errors
- Add property tests for deterministic topology/traversal invariants.
- Add golden assertions for canonical `grid(3,3)` and `hex(1)` adjacency layouts.

## File List Expected To Touch
- `test/integration/spatial-kernel-integration.test.ts` (new)
- `test/unit/property/spatial.property.test.ts` (new)
- `test/unit/spatial.golden.test.ts` (new)
- `src/kernel/apply-move.ts` (possible, only if integration test exposes missing emitted-event trigger dispatch)

## Out Of Scope
- New kernel runtime features beyond Spec 07.
- Broad refactors of existing non-spatial integration harnesses.
- Performance benchmarking beyond existing deterministic property loops.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/integration/spatial-kernel-integration.test.ts`
  - `evalQuery` + `evalCondition` spatial operators interoperate in one scenario.
  - `moveTokenAdjacent` emits `tokenEntered` and downstream trigger effects apply.
  - valid macro-generated topology yields zero spatial diagnostics in `validateGameDef`.
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

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `test/integration/spatial-kernel-integration.test.ts` for end-to-end spatial integration coverage, including `moveTokenAdjacent` trigger consumption.
  - Added `test/unit/property/spatial.property.test.ts` for deterministic spatial property-style invariants.
  - Added `test/unit/spatial.golden.test.ts` for canonical `grid(3,3)` and `hex(1)` topology golden assertions.
  - Patched `src/kernel/apply-move.ts` to dispatch events emitted by action effects through trigger dispatch before `actionResolved`.
- **Deviations from original plan**:
  - Original ticket assumed missing baseline spatial runtime/tests and compiler-integrated macro validation; reassessment confirmed those were already implemented in existing unit tests and current macro APIs.
  - Golden topology assertions were implemented inline in dedicated tests rather than JSON fixture files.
- **Verification**:
  - `npm test` passed (unit + integration).
