# ARCHGSD-005 - AST-Targeted Macro Binding Rewrite (No Global String Rewrites)

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / Compiler Correctness  
**Depends on**: `ARCHGSD-002`

## Why this ticket exists
Current macro hygiene renaming in `src/cnl/expand-effect-macros.ts` does two risky things:
- binder discovery is incomplete (currently only `chooseOne.bind` and `chooseN.bind` are explicitly collected);
- hygiene then performs a generic deep string rewrite, which can mutate non-binding literals.

This is not architecture-safe for a universal `GameSpecDoc` because it relies on string-shape coincidence instead of explicit binding semantics.

## 1) Specification (what must change)
- Replace generic string-based renaming in `src/cnl/expand-effect-macros.ts` with AST-targeted rewriting.
- Rewrite only binding-bearing locations:
  - effect binder declarations:
    - `forEach.bind`, `forEach.countBind`;
    - `removeByPriority.groups[].bind`, `removeByPriority.groups[].countBind`, `removeByPriority.remainingBind`;
    - `let.bind`, `chooseOne.bind`, `chooseN.bind`, `rollRandom.bind`;
  - `{ ref: 'binding', name }` references;
  - `{ query: 'binding', name }` references;
  - documented binding-template positions that resolve binding names (not arbitrary literals).
- Prohibit/diagnose unsupported dynamic binder declarations during macro expansion (for example non-string bind fields after param substitution) instead of silently skipping.
- Keep expansion deterministic and source-map-friendly.
- Do not add backward compatibility aliasing.

## 2) Invariants (must remain true)
- Literal strings that are not binding-bearing fields are never rewritten.
- Equivalent source produces identical expanded AST.
- Runtime (`GameDef` + kernel/sim) remains game-agnostic.

## 3) Tests to add/modify
## Test updates in existing file
- `test/unit/expand-effect-macros.test.ts`
  - verifies non-binding literals containing `$...` are not rewritten;
  - verifies all supported binding-bearing AST fields are rewritten consistently;
  - verifies unsupported dynamic binder declarations are deterministic compile errors.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Outcome
- **Completion date**: 2026-02-14
- **What changed**:
  - Reworked `src/cnl/expand-effect-macros.ts` to remove global arbitrary string rewrites and use explicit binding-aware rewrite paths.
  - Moved binder discovery/export validation into macro indexing so declarations are analyzed once per macro definition.
  - Added deterministic diagnostics for unsupported non-string binder declarations (`EFFECT_MACRO_BINDING_DECLARATION_INVALID`).
  - Added a post-substitution rewrite pass plus macro-args subtree rewrite handling to correctly preserve hygiene across nested macro expansion.
  - Expanded tests in `test/unit/expand-effect-macros.test.ts` for:
    - non-binding literal safety;
    - full binding-bearing field rewrite consistency;
    - deterministic dynamic binder declaration diagnostics.
- **Deviations from original plan**:
  - Scope was tightened to include explicit macro-args subtree handling after discovering nested macro invocation capture cases in production FITL profiles.
  - Existing test file was extended rather than creating a new test file.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` ✅
