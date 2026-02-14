# ARCHGSD-010 - Macro Hygiene Integrity Pass and Canonical Expansion Phase

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / Compiler Correctness  
**Depends on**: `ARCHGSD-007`, `ARCHGSD-009`

## Why this ticket exists
Macro expansion must have explicit, stable phases and enforce invocation-local hygiene guarantees after expansion. Without a dedicated integrity pass, regressions can hide behind broader compile-time binding checks and produce weaker diagnostics.

## Reassessed assumptions (2026-02-14)
- Already implemented in `src/cnl/expand-effect-macros.ts`:
  - typed macro-arg constraint validation;
  - deterministic binder hygiene renaming for non-exported bindings;
  - nested macro expansion with cycle/depth checks;
  - binding-aware nested macro-arg rewrites (from `ARCHGSD-009`).
- Already covered by `test/unit/expand-effect-macros.test.ts`:
  - nested macro expansion behavior;
  - deterministic non-exported binder renaming;
  - typed binding-aware parameter rewrite constraints;
  - unsupported dynamic binder declaration diagnostics.
- Missing relative to this ticket:
  - an explicit canonical phase boundary in code structure (validation/substitution/rewrite/recursive expansion not represented as named phases);
  - a dedicated post-expansion hygiene integrity pass per invocation that fails when:
    - non-exported local binders leak into binding-bearing output fields; or
    - unresolved binding-template placeholders remain in binding-bearing fields.

## Architectural rationale
The implemented architecture is more beneficial than the prior state because it:
- keeps macro expansion deterministic while making phase boundaries explicit and auditable in code;
- validates invocation-local hygiene directly in expansion output instead of relying on downstream compile failures;
- prevents silent rewrite-surface regressions by turning leaks/templates into deterministic expansion diagnostics with invocation paths;
- stays engine-agnostic by operating on generic binder/query/reference surfaces only.

## 1) Specification (implemented)
- Refactored macro invocation handling into explicit canonical phases in `expandEffect`:
  - typed arg validation;
  - param substitution;
  - deterministic hygiene rewrite;
  - recursive nested macro expansion;
  - post-expansion integrity validation.
- Added invocation-local hygiene integrity validation that rejects:
  - non-exported local binder leakage into binding-bearing output fields;
  - unresolved local binding-template placeholders in binding-bearing output fields.
- Added deterministic diagnostics with invocation-scoped paths:
  - `EFFECT_MACRO_HYGIENE_BINDING_LEAK`
  - `EFFECT_MACRO_HYGIENE_UNRESOLVED_TEMPLATE`
- Hardened rewrite coverage to recurse through nested `tokensInZone`/related query objects instead of returning early after zone rewriting.
- No legacy expansion path introduced.

## 2) Invariants (must remain true)
- Equivalent macro source yields identical expanded AST.
- Non-exported binder capture cannot escape macro boundaries.
- Unsupported dynamic binder declarations and unresolved binding templates fail compile deterministically.
- Runtime and compiler behavior remain game-agnostic.

## 3) Tests added/modified
- `test/unit/expand-effect-macros.test.ts`
  - added regression: non-exported local binder leakage from nested macro string params is rejected with `EFFECT_MACRO_HYGIENE_BINDING_LEAK`.
  - added regression: unresolved local template placeholder in binding-bearing output is rejected with `EFFECT_MACRO_HYGIENE_UNRESOLVED_TEMPLATE`.
  - added regression: nested `tokensInZone` filter binding references are hygienically rewritten (prevents early-return rewrite gap).

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Outcome
- **Completion date**: 2026-02-14
- **What changed vs originally planned**:
  - Scope was narrowed to the remaining architectural gaps after reassessment (canonical phase structure + dedicated integrity pass), because most typed rewrite mechanics were already delivered in `ARCHGSD-009`.
  - Implemented one additional robustness fix discovered during integration verification: recursive rewrite continuation for nested query filters (`tokensInZone` and related query objects).
- **Verification results**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
