# TEXHOLKERPRIGAMTOU-035: nextInOrderByCondition Anchor Evaluation Resilience

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Assumption Reassessment (Current Code/Test Reality)

1. `nextInOrderByCondition` currently evaluates `from` via `evalValue` in `src/kernel/eval-query.ts` without a local recovery boundary; recoverable eval errors currently bubble as throws.
2. Existing query code already has a precedent for recoverable eval degradation in `resolveIntDomainBound` (`DIVISION_BY_ZERO`, `MISSING_BINDING`, `MISSING_VAR` => empty-domain behavior), so this ticket should align with that recoverability contract rather than invent a broader one.
3. `test/unit/eval-query.test.ts` already covers successful traversal, wrap-around, include/exclude anchor semantics, no-match, explicit non-player order domains, and anchor-absent behavior.
4. Missing coverage is specifically recoverable `from` failures and preservation of non-recoverable throw behavior in `nextInOrderByCondition`.

## Problem

`nextInOrderByCondition` currently evaluates `from` directly in runtime query evaluation. If `from` resolves through missing bindings/vars or invalid arithmetic, runtime can throw instead of returning an empty result, which is inconsistent with other domain queries that degrade safely.

## 1) Updated Scope and Implementation Direction

1. In `src/kernel/eval-query.ts`, add a narrow recovery boundary around `nextInOrderByCondition` anchor (`from`) evaluation only.
2. Treat only recoverable eval codes already used by runtime query degradation (`MISSING_BINDING`, `MISSING_VAR`, `DIVISION_BY_ZERO`) as empty query result `[]`.
3. Do not widen recoverability to unrelated errors (for example `TYPE_MISMATCH`); those remain hard failures.
4. Encode this contract in unit tests, including both recoverable fallback and non-recoverable surfacing.

## 2) Invariants that should pass

1. `nextInOrderByCondition` never throws for recoverable anchor-resolution failures; it returns `[]`.
2. Non-recoverable runtime errors are still surfaced.
3. Behavior remains deterministic for identical state/input.
4. Existing successful traversal behavior is unchanged.

## 3) Tests that should pass

1. Add/extend unit tests in `test/unit/eval-query.test.ts` for:
- missing binding in `from`
- missing variable in `from`
- division-by-zero in `from`
- non-recoverable anchor eval error still throws (guardrail)
2. Keep existing successful traversal tests unchanged as regression coverage (already present in file).
3. Run `npm run build`.
4. Run `npm run lint`.
5. Run `npm test`.

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Added a recoverable-eval boundary for `nextInOrderByCondition.from` in `src/kernel/eval-query.ts`.
  - Recoverable codes now return `[]` for this anchor resolution path: `MISSING_BINDING`, `MISSING_VAR`, `DIVISION_BY_ZERO`.
  - Non-recoverable errors (for example `TYPE_MISMATCH`) continue to throw.
  - Added coverage in `test/unit/eval-query.test.ts` for missing binding, missing var, division-by-zero, and non-recoverable throw preservation.
- **Deviations from original plan**:
  - Added a small local helper (`isRecoverableEvalResolutionError`) to keep recoverable-code classification DRY and reused it in `resolveIntDomainBound`; this was not explicitly called out in the initial ticket text but preserves existing behavior while reducing duplication.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
