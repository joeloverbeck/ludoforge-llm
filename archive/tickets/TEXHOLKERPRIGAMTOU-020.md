# TEXHOLKERPRIGAMTOU-020: Canonical Domain Membership Utility Across Choice and Query Runtime

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019
**Blocks**: TEXHOLKERPRIGAMTOU-021

## 0) Reassessed assumptions (code/tests reality)

The original ticket was directionally correct but incomplete.

What already exists:
- `src/kernel/query-predicate.ts` is already the canonical scalar membership implementation for query predicates (`in`/`notIn`) and is consumed by both `eval-query` and `eval-condition`.
- Choice-domain membership is duplicated in two places:
  - `src/kernel/legal-choices.ts` (`valuesMatch` / `isInDomain`)
  - `src/kernel/effects-choice.ts` (`valuesMatch` / `isInDomain`)

Discrepancies found:
- There is no single membership module shared by both query predicates and choice validation.
- Query membership is strict scalar/set-typed; choice membership adds ad-hoc token/object `id` projection semantics.
- Choice equality is implemented with duplicated, non-canonical helpers, which increases drift risk when semantics evolve.

## 1) Updated scope

Centralize value/domain membership semantics used by `chooseOne`/`chooseN` and query filters into one canonical kernel utility.

Scope:
- Add one canonical kernel membership module used by:
  - query predicate membership (`in`/`notIn`)
  - choice-domain membership (`chooseOne`/`chooseN` in both discovery and execution surfaces)
- Replace duplicated `isInDomain`/value matching implementations in `legal-choices` and `effects-choice`.
- Define explicit canonical semantics:
  - query membership remains strict scalar set membership with typed validation.
  - choice membership supports scalar comparisons plus object-`id` projection for options domains that return entities (for example token rows), with deterministic equality semantics.
- Ensure `legalChoices` and effect execution use identical choice membership behavior.

Constraints:
- No fallback/legacy alias matching logic.
- One canonical value-matching policy for the engine.

## 2) Invariants that should pass

1. `legalChoices` and effect application use the exact same domain membership semantics.
2. Decision validity outcomes are deterministic and consistent across runtime surfaces.
3. Future changes to matching behavior require only one code-path update.

## 3) Tests that should pass

1. Unit: direct conformance tests for canonical membership utility (query scalar membership + choice-domain membership).
2. Unit: parity tests showing `legalChoices` and effect execution agree on valid/invalid selections under the shared helper.
3. Unit: id-projection and scalar equality behavior tests for choice domains.
4. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Added canonical membership module `src/kernel/value-membership.ts` for both strict scalar membership and choice-domain membership.
  - Replaced duplicated choice membership logic in `src/kernel/legal-choices.ts` and `src/kernel/effects-choice.ts` with shared canonical helpers.
  - Wired `src/kernel/query-predicate.ts` membership evaluation to the same canonical module.
  - Hardened choice-domain handling to fail fast when option items are not move-param encodable (`scalar` or object with `id: string`) rather than permissive best-effort casting.
  - Exported membership utilities via `src/kernel/index.ts`.
  - Added tests:
    - `test/unit/value-membership.test.ts`
    - `test/unit/kernel/choice-membership-parity.test.ts`
    - `test/unit/kernel/legal-choices.test.ts` (non-encodable choice-domain option regression)
    - `test/unit/effects-choice.test.ts` (non-encodable choice-domain option regression)
- Deviations from originally planned scope:
  - No game/runtime architecture rewrites were needed; the cleanest path was extracting and centralizing membership semantics while preserving existing engine contracts.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
