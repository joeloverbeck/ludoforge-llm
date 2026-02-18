# AGNOSTIC-003: Fail-Fast Contracts for Numeric Zone Attributes in Derived Metrics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: None

## Problem

Derived-value helpers now treat missing/non-numeric zone attributes as `0` (`numericAttribute` fallback). This can silently corrupt scoring/economy calculations when data has typos or missing fields.

Affected path:
- `packages/engine/src/kernel/derived-values.ts`

## Reassessed Assumptions (2026-02-18)

1. ✅ Confirmed: `numericAttribute` currently defaults to `0` for missing/non-numeric values.
2. ✅ Confirmed: current unit/integration tests do not assert fail-fast behavior for missing/non-numeric `population`/`econ`.
3. ❌ Previous assumption was inaccurate: there is currently no declarative derived-metric config in `GameSpecDoc`/`GameDef` for validation to target at compile boundary.
4. ✅ Therefore, compile-boundary enforcement for derived-value attribute requirements is blocked on a separate schema/config addition and cannot be correctly implemented in this ticket without inventing game-specific logic or hidden coupling.

## What Must Change

1. Replace silent `0` fallback with fail-fast behavior for required numeric attributes used in calculations.

2. Introduce a generic, declarative runtime contract for required zone attributes per derived computation (not FITL-specific). Examples:
- marker totals require `population: number`
- econ totals require `econ: number` on selected board zones

3. Keep runtime guardrails as the source of truth in this ticket. Compile-boundary enforcement is explicitly deferred until derived-metric requirements are represented in `GameSpecDoc`/`GameDef` schema.

4. Improve error messages to include zone id, attribute key, expected type, and calling computation.

## Invariants

1. Missing/invalid required numeric attributes never silently contribute `0`.
2. All derived calculations either compute from valid numeric data or fail with deterministic diagnostics/errors.
3. Contracts are generic and data-driven; no game-specific constants in kernel logic.
4. Existing valid specs continue to compute unchanged results.

## Tests That Should Pass

1. `packages/engine/test/unit/derived-values.test.ts`
- New case: missing `population` causes fail-fast error/diagnostic in marker computations.
- New case: non-numeric `econ` causes fail-fast error/diagnostic in econ computation.
- New case: scoped econ requirement only applies to included LoC spaces in `computeTotalEcon`.
- Existing happy-path tests remain green.

2. `packages/engine/test/integration/fitl-derived-values.test.ts`
- Regression: existing FITL computations remain unchanged for valid data.

3. `pnpm -F @ludoforge/engine test`

## Scope Notes

- This ticket does **not** add new `GameSpecDoc`/`GameDef` schema fields.
- This ticket does **not** add game-specific validation rules in kernel validation.
- Follow-up work (separate ticket/spec) should introduce declarative derived-metric requirements at compile boundary, then wire `validateGameDef` to enforce them.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Replaced silent numeric attribute fallback in `derived-values.ts` with fail-fast runtime validation.
  - Added generic derived-computation contracts for required numeric zone attributes (`computeMarkerTotal`, `computeTotalEcon`, `sumControlledPopulation`).
  - Added typed kernel runtime error contract `DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID` with deterministic context.
  - Added unit tests for missing/non-numeric attribute failures and scoped contract application in econ computation.
- **Deviation from original plan**:
  - Compile-boundary validation in `validateGameDef` was intentionally deferred because derived-metric requirements are not yet represented in `GameSpecDoc`/`GameDef`.
- **Verification**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
