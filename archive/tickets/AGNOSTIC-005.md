# AGNOSTIC-005: Reassess and Harden `GameDef.factions` Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes
**Deps**: None

## Reassessed Reality

The original assumption in this ticket was stale.

Current code already wires `GameDef.factions` from data assets:
- `deriveSectionsFromDataAssets()` returns `factions` from selected `pieceCatalog.payload.factions`.
- `compileExpandedDoc()` projects that value into `gameDef.factions` when present.
- Core runtime schema/types already define `factions` consistently as optional.
- Piece-catalog validation already enforces faction shape and catches undeclared faction references from `pieceTypes` and `inventory` when `payload.factions` is declared.

So this is not a "dead field" problem anymore.

## Remaining Problem

The contract is implemented, but test coverage in the ticket's cited suites is incomplete and does not clearly lock the intended include/omit behavior.

The highest-value gap is explicit compiler-pipeline coverage for:
- inclusion when selected piece catalog declares factions,
- omission when no faction catalog is declared.

## Affected Paths

- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/src/cnl/compile-data-assets.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/test/unit/compiler-structured-results.test.ts`
- `packages/engine/test/integration/compile-pipeline.test.ts`

## What Must Change

1. Keep the existing architecture direction (wired, data-driven optional field) and do not remove `GameDef.factions`.
2. Add/strengthen tests that assert deterministic compiler output contract for `factions`:
- included when selected piece catalog provides `payload.factions`,
- omitted when no selected piece catalog faction catalog exists.
3. Verify no regressions in schema/runtime boundary validation and compile pipeline suites.

## Invariants

1. `GameDef.factions` is never a synthetic placeholder; it is sourced from selected data assets only.
2. If `factions` exists, it is deterministic and schema-valid.
3. If `factions` is absent, compile/runtime paths remain valid and do not require it.
4. Contract remains game-agnostic and data-driven.

## Tests That Should Pass

1. `packages/engine/test/unit/schemas-top-level.test.ts`
- Confirms `GameDef` schema accepts optional `factions` contract.

2. `packages/engine/test/unit/compiler-structured-results.test.ts`
- Add assertion that compiler output consistently includes/excludes `factions` per contract.

3. `packages/engine/test/integration/compile-pipeline.test.ts`
- Regression coverage for end-to-end compiled `GameDef.factions` shape.

4. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Reassessed and corrected ticket assumptions to match current architecture: `GameDef.factions` is already derived from selected piece-catalog data assets and projected by the compiler.
  - Narrowed scope from architecture rewrite/removal to contract hardening via explicit tests.
  - Added coverage for include/omit `factions` behavior and selected-scenario piece-catalog derivation.
- **Deviations from original plan**:
  - Did not remove `GameDef.factions` or redesign schema/types, because the "dead field" premise was no longer true.
  - Focused on robustness through invariant tests rather than structural refactor.
- **Verification**:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
