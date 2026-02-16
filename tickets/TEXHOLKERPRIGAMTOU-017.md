# TEXHOLKERPRIGAMTOU-017: Selector Parity for Macros and Dynamic Zone Queries

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-016
**Blocks**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-020

## 1) What must change / be implemented

Close selector expressiveness gaps so GameSpecDoc can model dynamic card/board logic without engine special cases:

1. Extend macro param constraint checking so `playerSelector` and `zoneSelector` accept canonical selector object forms (not only strings).
2. Add canonical dynamic-zone query support for token queries:
- Either allow `tokensInZone.zone` to accept `ZoneRef` (string or zoneExpr),
- Or add one canonical query variant that supports runtime-resolved zone references.
3. Ensure lowering/validation/runtime all agree on the same selector/query contract.
4. Update:
- `src/cnl/expand-effect-macros.ts`
- `src/cnl/compile-conditions.ts` and/or `src/cnl/compile-effects.ts` (query lowering)
- `src/kernel/types-ast.ts`
- `src/kernel/schemas-ast.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- related schema artifacts
5. Keep this generic for any game; no poker-specific branches.
6. No alias syntaxes; exactly one canonical representation.

## 2) Invariants that should pass

1. Macro selector constraints and effect/query selector capabilities are contract-compatible.
2. Dynamic zone token queries evaluate deterministically.
3. Invalid selector/query shapes produce structured diagnostics with stable paths.
4. Existing static-zone queries keep identical behavior.
5. Engine remains game-agnostic.

## 3) Tests that should pass

1. Unit: macro arg constraint accepts/rejects selector object forms correctly.
2. Unit: compiler lowers dynamic zone token queries correctly.
3. Unit: runtime evaluates dynamic zone token queries with deterministic results.
4. Unit: validation catches invalid zone refs in dynamic token queries.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
