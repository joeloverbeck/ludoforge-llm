# TEXHOLKERPRIGAMTOU-020: Canonical Domain Membership Utility Across Choice and Query Runtime

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019
**Blocks**: TEXHOLKERPRIGAMTOU-021

## 1) What needs to be fixed/added

Centralize value/domain membership semantics used by `chooseOne`/`chooseN` and query filters into one canonical kernel utility.

Scope:
- Replace duplicated `isInDomain`/value matching implementations in `legal-choices` and `effects-choice`.
- Share canonical equality/membership behavior with predicate engine semantics.
- Ensure bindings, ids, and scalar values are compared consistently across all runtime surfaces.

Constraints:
- No fallback/legacy alias matching logic.
- One canonical value-matching policy for the engine.

## 2) Invariants that should pass

1. `legalChoices` and effect application use the exact same domain membership semantics.
2. Decision validity outcomes are deterministic and consistent across runtime surfaces.
3. Future changes to matching behavior require only one code-path update.

## 3) Tests that should pass

1. Unit: direct conformance tests for canonical membership utility.
2. Unit: parity tests showing `legalChoices` and effect execution agree on valid/invalid selections.
3. Unit: id-based and scalar-based comparison behavior tests.
4. Regression: `npm run build`, `npm test`, `npm run lint`.
