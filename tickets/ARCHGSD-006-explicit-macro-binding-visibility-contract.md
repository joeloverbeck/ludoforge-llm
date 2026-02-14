# ARCHGSD-006 - Explicit Macro Binding Visibility Contract (No Implicit Exports)

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / DSL Contract  
**Depends on**: `ARCHGSD-005`

## Why this ticket exists
Macro binder visibility currently relies on implicit conventions (for example templated vs non-templated names). This is brittle and prevents robust, explicit contracts at scale.

## 1) Specification (what must change)
- Make macro binding visibility explicit-only in `GameSpecDoc`:
  - `exports` is the single source of truth for public macro decision/binding names.
- Remove implicit export heuristics from expansion logic.
- Add strict diagnostics for visibility violations:
  - exported symbol not declared;
  - duplicate exports;
  - cross-stage use of a non-exported macro binder.
- Update production game specs to declare required exports explicitly.
- No fallback alias mode.

## 2) Invariants (must remain true)
- Macro public contract is fully readable from macro definition alone.
- Non-exported macro-local binders never leak to caller-visible move params.
- Existing behavior remains deterministic after explicit migrations.

## 3) Tests to add/modify
## New tests
- `test/unit/expand-effect-macros.test.ts`
  - explicit exports required for external visibility;
  - non-exported cross-stage reference fails deterministically.
- `test/integration/effect-macro-compile.test.ts`
  - end-to-end pipeline using explicit exports only.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
