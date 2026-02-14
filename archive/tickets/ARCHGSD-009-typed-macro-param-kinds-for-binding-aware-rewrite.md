# ARCHGSD-009 - Typed Macro Param Kinds for Binding-Aware Rewrite (Remove Heuristic Arg Rewrites)

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / DSL Contract  
**Depends on**: `ARCHGSD-007`

## Why this ticket exists
Macro hygiene currently uses lexical heuristics when traversing macro `args` payloads (checking for `$`/`{` in strings via `valueLooksLikeBinding`). This is not a stable architecture for a universal `GameSpecDoc` and can misclassify literals.

## Current state reassessment (2026-02-14)
- Already implemented:
  - Macro param constraints support legacy primitives plus constrained kinds (`enum`, `literals`).
  - Constraint validation diagnostics exist (`EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION`, declaration info diagnostics).
  - Unit/integration coverage exists for constrained params.
- Not implemented yet (remaining scope of this ticket):
  - Explicit binding-aware macro param kinds.
  - Type-directed macro-arg rewrite for macro hygiene.
  - Removal of heuristic macro-arg string rewriting.

This ticket does **not** rework unrelated hygiene mechanics; it specifically replaces heuristic `args` rewrites with typed contracts.

## 1) Specification (what must change)
- Extend macro param typing in `GameSpecDoc` to include explicit binding-aware param kinds:
  - `bindingName`
  - `bindingTemplate`
  - `zoneSelector`
  - `playerSelector`
  - `tokenSelector`
- Remove heuristic arg string rewriting from macro expansion (`valueLooksLikeBinding`-style checks).
- During macro expansion, rewrite only values that are:
  - in registered binder/referencer AST fields; or
  - passed via params whose declared kind is binding-aware.
- Keep strict diagnostics for type violations at invocation sites.
- No backward-compat alias behavior.

## 2) Invariants (must remain true)
- Literal author text is never rewritten unless declared binding-aware by schema/param kind.
- Macro hygiene behavior is fully determined by typed contracts, not string-shape heuristics.
- Runtime (`GameDef` + kernel/sim) stays game-agnostic.

## 3) Tests to add/modify
## Modify/add tests
- `test/unit/expand-effect-macros.test.ts`
  - binding-aware param kinds rewrite correctly.
  - non-binding param kinds preserve literals containing `$`/`{`.
  - incorrect arg type for binding-aware kind fails deterministically.

- `test/integration/effect-macro-compile.test.ts` (if needed)
  - one compile-path assertion for binding-aware param kind acceptance/rejection to ensure expansion+compile pipeline parity.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added explicit binding-aware macro param kinds to `GameSpecDoc` (`bindingName`, `bindingTemplate`, `zoneSelector`, `playerSelector`, `tokenSelector`).
  - Replaced heuristic macro-arg rewrite (`valueLooksLikeBinding`) with type-directed rewrite based on callee param constraints.
  - Added binding-aware constraint validation coverage and nested macro rewrite coverage in unit/integration tests.
  - Updated FITL production macro typing where runtime relied on binding-bearing `string` args (`insurgent-ambush-remove-coin-piece.targetSpace` now `zoneSelector`).
  - Strengthened binder rewrite behavior for `adjacent` condition operands (`left`/`right`) and added a regression test.
- Deviations from original plan:
  - Required one additional robustness fix outside `args` rewrite (`left`/`right` binding rewrite) because this invariant gap was exposed once heuristic behavior was removed.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
