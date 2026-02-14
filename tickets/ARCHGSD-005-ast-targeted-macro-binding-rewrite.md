# ARCHGSD-005 - AST-Targeted Macro Binding Rewrite (No Global String Rewrites)

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / Compiler Correctness  
**Depends on**: `ARCHGSD-002`

## Why this ticket exists
Current macro hygiene renaming rewrites arbitrary string nodes during expansion. This is not architecture-safe for a universal `GameSpecDoc` because non-binding literals can be unintentionally modified.

## 1) Specification (what must change)
- Replace generic string-based renaming in `src/cnl/expand-effect-macros.ts` with AST-targeted rewriting.
- Rewrite only binding-bearing locations:
  - effect binder declarations (`bind`, `countBind`, `remainingBind` where applicable per binder policy);
  - `{ ref: 'binding', name }` references;
  - `{ query: 'binding', name }` references;
  - documented binding-template positions that resolve binding names (not arbitrary literals).
- Prohibit/diagnose unsupported dynamic binder declarations during macro expansion instead of silently skipping.
- Keep expansion deterministic and source-map-friendly.
- Do not add backward compatibility aliasing.

## 2) Invariants (must remain true)
- Literal strings that are not binding-bearing fields are never rewritten.
- Equivalent source produces identical expanded AST.
- Runtime (`GameDef` + kernel/sim) remains game-agnostic.

## 3) Tests to add/modify
## New tests
- `test/unit/expand-effect-macros.test.ts`
  - verifies non-binding literals containing `$...` are not rewritten;
  - verifies all binding-bearing AST fields are rewritten consistently;
  - verifies unsupported dynamic binder declarations are deterministic compile errors.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
