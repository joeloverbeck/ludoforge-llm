# TEXHOLKERPRIGAMTOU-018: Canonical Generic Predicate Engine for Query Domains

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-016 (completed), TEXHOLKERPRIGAMTOU-017 (completed)
**Blocks**: TEXHOLKERPRIGAMTOU-020

## 0) Reassessed assumptions (code/tests reality)

This ticket's original assumptions were partially outdated.

What already exists:
- `src/kernel/eval-query.ts` already shares core operator matching (`eq`, `neq`, `in`, `notIn`) between token filters and asset-row predicates.
- Token and asset-row query paths already converge on shared helper flow for predicate application.
- Baseline operator behavior is already covered by `test/unit/eval-query.test.ts`.

What is still missing:
- Membership semantics are not type-stable: `in`/`notIn` currently coerce row/token field values via `String(...)`.
- Predicate set literals are schema-limited to `string[]`, preventing canonical typed set semantics across string/number/boolean domains.
- Invalid membership comparisons are silently treated as non-match in some cases instead of raising explicit typed errors.
- Shared predicate behavior is implemented inside `eval-query.ts` rather than as a dedicated reusable predicate engine module.

## 1) Updated scope

Promote current shared helper behavior into a canonical generic predicate engine with strict typed membership semantics.

Scope:
- Extract a dedicated generic predicate evaluator module consumed by both token and asset-row query paths.
- Standardize operator semantics (`eq`, `neq`, `in`, `notIn`) under that shared evaluator.
- Replace membership string-coercion behavior with strict scalar-typed matching.
- Broaden predicate set literal contracts from string-only arrays to scalar arrays (`string | number | boolean`) with deterministic validation.
- Surface explicit typed runtime errors for invalid membership operands (non-array set, mixed-type set elements, set/field type mismatch).
- Keep domain field access abstract via thin adapters; do not hardcode domain-specific predicate semantics.

Out of scope:
- Reworking condition AST semantics (`ConditionAST`) beyond query filter/where predicates.
- Adding new query domains in this ticket.
- Performance micro-optimizations unrelated to predicate semantics.

Constraints:
- No alias operators.
- No implicit backward-compat coercions.
- Predicate behavior must be deterministic and documented as canonical engine semantics.

## 2) Invariants that must pass

1. All query domains use the same predicate evaluation semantics.
2. Membership operations are type-stable and deterministic.
3. Invalid typed membership comparisons are surfaced with explicit diagnostics/errors.
4. Adding a new query row domain requires only adapter wiring, not new predicate semantics.
5. Query row ordering and existing non-membership behavior remain unchanged.

## 3) Tests required

1. Unit: shared predicate engine conformance tests for all operators.
2. Unit: token query and asset-row query parity tests (same predicates, same expected results).
3. Unit: strict type membership rejection tests (mixed scalar set types, set/field type mismatch, invalid membership operand shape).
4. Unit: adapter tests proving new domain integration path stays generic.
5. Unit: schema tests proving predicate set literals accept scalar arrays and reject invalid element types.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Added a dedicated canonical predicate engine module (`src/kernel/query-predicate.ts`) with adapter-based row access and shared operator semantics.
  - Migrated query filtering to consume the canonical module from `src/kernel/eval-query.ts` for both token filters and asset-row predicates.
  - Removed implicit `String(...)` coercion for membership operators and enforced strict scalar type matching.
  - Added explicit typed runtime errors for invalid membership inputs:
    - non-array values used with `in`/`notIn`
    - mixed scalar types inside membership sets
    - set/field scalar type mismatches
  - Broadened AST/schema predicate set literals to scalar arrays (`string | number | boolean`) in `src/kernel/types-ast.ts` and `src/kernel/schemas-ast.ts`.
  - Added and updated unit tests for conformance and edge cases in:
    - `test/unit/query-predicate.test.ts`
    - `test/unit/eval-query.test.ts`
    - `test/unit/schemas-ast.test.ts`
- Deviations from originally planned scope:
  - Original ticket assumed broad duplicated predicate logic; reassessment showed partial unification already existed. Work focused on extracting a reusable canonical module and fixing strict-typing gaps rather than broad query-handler rewrites.
- Verification results:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
