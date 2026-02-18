# AGNOSTIC-003: Fail-Fast Contracts for Numeric Zone Attributes in Derived Metrics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: None

## Problem

Derived-value helpers now treat missing/non-numeric zone attributes as `0` (`numericAttribute` fallback). This can silently corrupt scoring/economy calculations when data has typos or missing fields.

Affected path:
- `packages/engine/src/kernel/derived-values.ts`

## What Must Change

1. Replace silent `0` fallback with fail-fast behavior for required numeric attributes used in calculations.

2. Introduce a generic, declarative contract for required zone attributes per derived computation (not FITL-specific). Examples:
- marker totals require `population: number`
- econ totals require `econ: number` on selected board zones

3. Enforce contracts at validation/compile boundary where possible, and keep runtime guardrails for defensive safety.

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
- Existing happy-path tests remain green.

2. `packages/engine/test/unit/validate-gamedef.test.ts`
- New validation case for missing required numeric attrs under configured derived metrics.

3. `packages/engine/test/integration/fitl-derived-values.test.ts`
- Regression: existing FITL computations remain unchanged for valid data.

4. `pnpm -F @ludoforge/engine test`
