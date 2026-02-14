# ARCHGSD-009 - Typed Macro Param Kinds for Binding-Aware Rewrite (Remove Heuristic Arg Rewrites)

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / DSL Contract  
**Depends on**: `ARCHGSD-007`

## Why this ticket exists
Macro hygiene currently uses lexical heuristics when traversing macro `args` payloads (for example checking for `$`/`{` in strings). This is not a stable architecture for a universal `GameSpecDoc` and can misclassify literals.

## 1) Specification (what must change)
- Extend macro param typing in `GameSpecDoc` to include explicit binding-aware param kinds, for example:
  - `bindingName`
  - `bindingTemplate`
  - `zoneSelector`
  - `playerSelector`
  - `tokenSelector`
- Remove heuristic arg string rewriting from macro expansion.
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
## New tests
- `test/unit/expand-effect-macros.test.ts`
  - binding-aware param kinds rewrite correctly.
  - non-binding param kinds preserve literals containing `$`/`{`.
  - incorrect arg type for binding-aware kind fails deterministically.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
