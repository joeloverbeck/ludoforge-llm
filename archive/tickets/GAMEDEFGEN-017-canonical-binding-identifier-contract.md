# GAMEDEFGEN-017: Canonical Binding Identifier Contract Across Selectors and Refs

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## Reassessment (2026-02-15)

### Verified Current Reality

1. There is already **no implicit aliasing** between `$name` and `name` for binding references; matching is exact-string identity.
2. Deterministic missing-binding diagnostics are already present in compiler paths for selector contracts and `{ ref: "binding", name }` references.
3. Selector parsing from CNL currently enforces `$...` shape for binding-derived player selectors, but this rule is not centralized in the shared selector contract evaluator.

### Discrepancies From Original Assumptions

1. Original assumption “mixed-form tolerance (implicit `$name` ↔ `name` equivalence)” is inaccurate for current code; that aliasing is already rejected.
2. Remaining architectural gap is not alias normalization, but **distributed contract logic** and missing explicit malformed-token handling in shared selector-contract checks.

### Updated Scope

1. Preserve the existing exact-string identity rule (no aliasing, no transformations).
2. Centralize binding identifier validation/matching in one shared contract utility used by selector contract evaluation and binding-reference validation.
3. Add explicit malformed selector binding-token diagnostics (for non-canonical selector binding strings) in deterministic order.
4. Keep the contract game-agnostic and reusable.

## 1) What Needs To Change / Be Added

1. Define one canonical binding identifier contract utility across action params, selector binding tokens, and `{ ref: "binding", name: ... }` references.
2. Keep exact-name identity semantics end-to-end (no aliasing or normalization).
3. Centralize binding-name validation and matching so compiler/lowering/cross-validation all use one shared rule.
4. Standardize diagnostics for binding-name contract violations (missing declaration, malformed selector token, format mismatch) with deterministic code/path ordering.
5. Keep contract generic and game-agnostic; do not create per-game binding conventions.

## 2) Invariants That Should Pass

1. Binding declaration and binding references match under exactly one canonical representation.
2. No implicit aliasing/transformation occurs between differently-formatted binding names.
3. Malformed selector binding tokens are rejected deterministically.
4. Compiler and runtime-facing contract checks use the same canonical rule and produce deterministic outcomes.
5. Valid specs using canonical binding names compile unchanged.

## 3) Tests That Should Pass

1. Unit: canonical binding names pass through params/selectors/binding refs without normalization drift.
2. Unit: mismatched binding formats fail with deterministic diagnostics at precise paths.
3. Unit: selector contract checks (`bindingNotDeclared`, pipeline-related checks) operate on canonical names only.
4. Unit: malformed selector binding token is reported explicitly and deterministically.
5. Regression: existing binding and selector contract suites pass after contract centralization.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added shared binding identifier contract utilities in `src/kernel/binding-identifier-contract.ts`.
  - Centralized binding membership/alternative ranking usage in `compile-conditions` and `compile-effects`.
  - Extended action selector contract evaluation to detect malformed selector binding identifiers and expose role-specific diagnostic codes.
  - Wired malformed-selector diagnostics into compile lowering and cross-validation.
  - Added tests for malformed selector binding handling and cross-validation behavior.
- Deviations from original plan:
  - Did not implement `$name`/`name` alias removal because reassessment confirmed aliasing did not exist in current code; scope shifted to centralization and malformed-token diagnostics.
- Verification:
  - `npm run build` passed.
  - Targeted selector/binding suites passed.
  - Full `npm test` passed (212 tests).
  - `npm run lint` passed.
