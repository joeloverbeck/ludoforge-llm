# ARCHGSD-011 - Macro Expansion Source Map Fidelity

**Status**: TODO  
**Priority**: P1  
**Type**: Architecture / Tooling Correctness  
**Depends on**: `ARCHGSD-010`

## Why this ticket exists
Macro diagnostics currently rely heavily on synthesized expansion paths. For large games/specs, debugging requires stable traceability from expanded nodes back to author YAML/markdown origins.

## 1) Specification (what must change)
- Propagate source-map metadata through macro expansion:
  - for substituted params,
  - for rewritten binder declarations/references,
  - for nested macro expansions.
- Ensure diagnostics can point to both:
  - expanded location; and
  - original source location (macro def site and invocation site).
- Keep deterministic sorting/dedup behavior unchanged.
- No fallback to path-only diagnostics where mapping is representable.

## 2) Invariants (must remain true)
- Diagnostics remain deterministic and stable across repeated compiles.
- Source mapping does not alter runtime semantics or expansion output.
- Mapping works uniformly across setup/actions/triggers/actionPipelines.

## 3) Tests to add/modify
## New tests
- `test/unit/compiler-diagnostics.test.ts`
  - macro-origin diagnostics include mapped source location metadata.
- `test/integration/effect-macro-compile.test.ts`
  - nested macro failures map to macro declaration + invocation locations deterministically.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
