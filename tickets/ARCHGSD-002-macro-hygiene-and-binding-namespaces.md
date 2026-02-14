# ARCHGSD-002 - Macro Hygiene and Binding Namespaces

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / DSL Semantics  
**Depends on**: `ARCHGSD-001`

## Why this ticket exists
Reusable effect macros currently depend on globally visible binding names. That creates collision risk and reduces composability for large, generic rules libraries.

## 1) Specification (what must change)
- Introduce hygienic macro expansion semantics:
  - macro-local binding scope by default;
  - explicit exported binding contract only when intentionally required.
- Add deterministic macro namespace/prefix mechanism for decision bindings produced by macros.
- Reject ambiguous or colliding bindings at compile time with explicit diagnostics.
- Update macro-expansion compiler path and AST lowering to preserve deterministic naming and source mapping.
- No alias/backward-compat mode for old collision-prone behavior.

## 2) Invariants (must remain true)
- Two macros used in the same action pipeline cannot silently overwrite each other’s bindings.
- Deterministic expansion: same source + seed produces identical choice IDs and trace structure.
- Existing non-colliding macros retain behavioral equivalence after migration.
- Runtime engine remains game-agnostic; hygiene is compiler/DSL behavior, not game-specific runtime logic.

## 3) Tests that must pass
## New tests to add
- `test/unit/cnl/macro-hygiene.test.ts`
  - local binding isolation;
  - exported binding rules;
  - collision diagnostics.
- `test/integration/decision-sequence-macro-hygiene.test.ts`
  - stable decision sequence with multiple macro invocations in one pipeline.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

