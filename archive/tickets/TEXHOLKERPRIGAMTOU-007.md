# TEXHOLKERPRIGAMTOU-007: Tier 2 — Compilation Tests (Parse, Validate, Compile Texas Hold 'Em)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-001 through -006 (all kernel primitives and GameSpecDoc files)
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Strengthen Texas Hold 'Em compilation test coverage using the existing production-spec helper and current test architecture, without introducing duplicate helpers or redundant test suites.

## Assumptions Reassessed (2026-02-16)

The original assumptions no longer matched the repository state:

1. `test/helpers/production-spec-helpers.ts` already contains `compileTexasProductionSpec()` with lazy caching and hash invalidation.
2. Texas parse/validate/compile and structural checks already exist in `test/unit/texas-holdem-spec-structure.test.ts`.
3. Texas vocabulary now includes additional variables:
- per-player: `showdownScore` (8 total per-player vars)
- global: `oddChipRemainder` (15 total global vars)
4. Canonical schema artifact path is `schemas/GameDef.schema.json` (not `schemas/gamedef.schema.json`).
5. Parsing is architecture-defined as composed directory source via `loadGameSpecSource(data/games/texas-holdem)`; per-file standalone parse assertions are not the primary target.

## What to Change

### 1. Preserve a single canonical Texas helper

**File**: `test/helpers/production-spec-helpers.ts` (modify only if necessary)

- Keep `compileTexasProductionSpec()` as the only Texas helper entrypoint.
- Do not add `compileTexasHoldemSpec()` aliasing or duplicate APIs.
- Ensure helper cache behavior remains verifiable via tests.

### 2. Extend Texas compilation tests in place

**Primary file**: `test/unit/texas-holdem-spec-structure.test.ts` (modify)

Add or strengthen assertions for:

1. Parse composed Texas production source without parse errors.
2. Validate with zero error diagnostics.
3. Compile with zero diagnostics and non-null GameDef.
4. Zone structure contains exactly: `deck`, `burn`, `community`, `hand`, `muck` with expected owner/visibility/ordering tuples.
5. Per-player vars include all expected names including `showdownScore` with expected init/type.
6. Global vars include all expected names including `oddChipRemainder` with expected init/type.
7. Actions include exactly: `fold`, `check`, `call`, `raise`, `allIn`.
8. Phases include exactly: `hand-setup`, `preflop`, `flop`, `turn`, `river`, `showdown`, `hand-cleanup`.
9. Terminal condition includes `activePlayers == 1` semantics.
10. Macro lowering leaves no macro invocation references in compiled effects.
11. Compiled effects include `reveal`, `evaluateSubset`, and `commitResource` usage.
12. Compiled GameDef validates against `schemas/GameDef.schema.json`.
13. Helper caching: repeated `compileTexasProductionSpec()` calls return the same object instance while content hash is unchanged.

### 3. Keep coverage DRY

- Reuse existing helper/utilities where possible (`assertNoErrors`, `assertNoDiagnostics`, schema helpers used in `test/unit/json-schema.test.ts`).
- Avoid creating a parallel test file unless a clear cohesion reason appears during implementation.

## Files to Touch

| File | Change Type |
|------|-------------|
| `test/unit/texas-holdem-spec-structure.test.ts` | Modify — expand compilation assertions |
| `test/helpers/production-spec-helpers.ts` | Modify only if helper testability requires it |

## Out of Scope

- **DO NOT** modify `src/` kernel or compiler code in this ticket.
- **DO NOT** modify Texas GameSpecDoc assets in `data/games/texas-holdem/`.
- **DO NOT** add integration/e2e Texas behavior tests (covered by other tickets).
- **DO NOT** modify FITL behavior or helper semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Updated Texas unit compilation/structure tests pass.
2. Regression suite passes: `npm test`.
3. Build passes: `npm run build`.
4. Lint passes: `npm run lint`.

### Invariants That Must Remain True

1. FITL helper path and behavior remain unchanged.
2. `compileTexasProductionSpec()` caching remains deterministic and effective.
3. Compilation remains deterministic for unchanged source.
4. No backwards-compat aliasing introduced for helper naming.
5. GameDef compiled from Texas source remains complete and schema-valid.

## Outcome

- Completion date: 2026-02-16
- What was changed:
- Reassessed and corrected ticket assumptions before implementation (helper naming, existing Texas tests, variable inventory, schema path, composed-source parsing model).
- Expanded `test/unit/texas-holdem-spec-structure.test.ts` with additional compilation-contract assertions:
  - compiled zone topology/materialization checks
  - per-player/global var contract checks including `showdownScore` and `oddChipRemainder`
  - compiled actions/phases/terminal semantics checks
  - macro lowering assertion (`"macro"` absent in compiled GameDef)
  - required effect families present (`reveal`, `evaluateSubset`, `commitResource`)
  - compiled Texas GameDef schema validation against `schemas/GameDef.schema.json`
  - helper cache determinism (`compileTexasProductionSpec()` returns same instance on repeated unchanged calls)
- Deviations from original plan:
- Did not add `compileTexasHoldemSpec()`; retained a single canonical helper (`compileTexasProductionSpec()`) to avoid aliasing/duplication.
- Did not create `test/unit/compile-texas-holdem.test.ts`; extended existing Texas structure test file to keep coverage DRY and cohesive.
- Verification:
- `npm run build` passed.
- `npm test` passed.
- `npm run lint` passed.
