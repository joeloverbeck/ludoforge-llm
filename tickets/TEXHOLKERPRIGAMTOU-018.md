# TEXHOLKERPRIGAMTOU-018: Canonical Generic Predicate Engine for Query Domains

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-016, TEXHOLKERPRIGAMTOU-017
**Blocks**: TEXHOLKERPRIGAMTOU-020

## 1) What needs to be fixed/added

Unify filter/predicate evaluation across query domains under one canonical generic predicate engine.

Scope:
- Define one predicate AST/evaluator contract shared by token rows, asset rows, and future query row types.
- Remove duplicated predicate-resolution/matching logic from domain-specific query handlers.
- Standardize operator semantics (`eq`, `neq`, `in`, `notIn`) across all domains.
- Enforce strict typed membership semantics (no implicit string coercion for membership checks).
- Keep row access abstract via domain adapters/accessors.

Constraints:
- No alias operators.
- No implicit backward-compat coercions.
- Predicate behavior must be deterministic and documented as canonical engine semantics.

## 2) Invariants that should pass

1. All query domains use the same predicate evaluation semantics.
2. Membership operations are type-stable and deterministic.
3. Invalid typed membership comparisons are surfaced with explicit diagnostics/errors.
4. Adding a new query row domain requires only adapter wiring, not new predicate semantics.

## 3) Tests that should pass

1. Unit: shared predicate engine conformance tests for all operators.
2. Unit: token query and asset-row query parity tests (same predicates, same expected results).
3. Unit: strict type membership rejection tests (mixed scalar types, invalid set element types).
4. Unit: adapter tests proving new domain integration path stays generic.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
