# ARCHGSD-010 - Macro Hygiene Integrity Pass and Canonical Expansion Phase

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / Compiler Correctness  
**Depends on**: `ARCHGSD-007`, `ARCHGSD-009`

## Why this ticket exists
Macro expansion currently needs multiple rewrite steps to maintain hygiene across substitution and nesting. We need one canonical expansion phase plus explicit post-check guarantees so hygiene cannot regress silently.

## 1) Specification (what must change)
- Refactor macro expansion into a single canonical order:
  - typed arg validation
  - param substitution
  - binder declaration/reference validation
  - one deterministic hygiene rewrite
  - recursive nested macro expansion
- Add a dedicated hygiene integrity pass that validates, per expanded macro invocation:
  - no non-exported local binder names leak into output binding-bearing fields;
  - no unresolved binding-template placeholders remain in binding-bearing positions.
- Emit deterministic diagnostics for integrity violations with precise invocation paths.
- No dual-path or legacy expansion flow.

## 2) Invariants (must remain true)
- Equivalent macro source yields identical expanded AST.
- Non-exported binder capture cannot escape macro boundaries.
- Unsupported dynamic binder declarations and unresolved binding templates fail compile deterministically.

## 3) Tests to add/modify
## New tests
- `test/unit/expand-effect-macros.test.ts`
  - nested macro invocation with cross-macro args preserves hygiene in one canonical pass.
  - non-exported binder leakage is rejected by integrity diagnostics.
  - unresolved template in binding-bearing field is rejected deterministically.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
