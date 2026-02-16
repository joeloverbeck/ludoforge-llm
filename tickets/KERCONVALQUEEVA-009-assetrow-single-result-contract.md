# KERCONVALQUEEVA-009: Exact-Match Runtime Table Lookup Contract (Single-Row Semantics)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: GAMEDEFGEN-029
**Blocks**: Safe data-driven control flow across card/board games

## 1) What needs to change/be added

Add a game-agnostic runtime table lookup contract that can require exactly one row and fail hard on 0 or >1 matches.

Scope:
- Extend query/effect AST with a strict single-row lookup form (or equivalent) usable from value/effect contexts.
- Support explicit cardinality modes (`exactlyOne`, optionally `zeroOrOne`), with `exactlyOne` as the strict path for invariants.
- Add dedicated runtime errors and compile-time behavior validation for unsupported/malformed lookup usage.
- Refactor Texas blind escalation to use strict single-row lookup for next blind level row selection.

Out of scope:
- Silent fallback to list-style iteration when single-row lookup is requested.

## 2) Invariants that must pass

1. `exactlyOne` lookup fails when 0 rows match.
2. `exactlyOne` lookup fails when >1 rows match.
3. Failure includes deterministic error code + context (table id/name, predicates, cardinality mode).
4. Query behavior is generic and reusable for any game data table.

## 3) Tests that must pass

1. Unit: runtime lookup success path returns single row and allows field resolution.
2. Unit: 0-match and multi-match each throw dedicated deterministic errors.
3. Unit: compiler/validator rejects malformed single-row lookup declarations.
4. Integration: Texas escalation fails explicitly on malformed schedule instead of silently no-oping.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
