# ARCHGSD-004 - Typed Macro Parameters and Literal Constraints

**Status**: TODO  
**Priority**: P1  
**Type**: Architecture / Validation  
**Depends on**: none

## Why this ticket exists
Macro parameters currently allow broad `string` usage where constrained literals/enums are required (for example faction IDs). This delays errors and weakens composability.

## 1) Specification (what must change)
- Extend macro parameter schema support to allow constrained types:
  - enum/literal sets;
  - existing scalar/value types where applicable.
- Add compile-time validation for macro invocation arguments against declared param constraints.
- Emit deterministic, source-mapped diagnostics for invalid macro args.
- Migrate production macros that currently use unconstrained string params where tighter contracts are known (for example faction params).
- No backward-compat aliases for invalid/untyped invocation forms.

## 2) Invariants (must remain true)
- Invalid macro args fail at compile time, never as deferred runtime behavior.
- Valid invocations remain deterministic and produce equivalent GameDef/runtime outcomes.
- Source maps for macro-arg diagnostics point to invocation site and param declaration deterministically.
- GameDef and simulator remain generic; only DSL contracts get stricter.

## 3) Tests that must pass
## New tests to add
- `test/unit/cnl/macro-param-typing.test.ts`
  - accepts valid enum/literal invocations;
  - rejects invalid literals/types with stable diagnostic codes/paths.
- `test/integration/effect-macro-compile-pipeline.test.ts`
  - verifies constrained macro params through full parse/validate/compile flow.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`

