# TEXHOLKERPRIGAMTOU-029: Definite-Binding Static Guarantees (Compile-Time Dataflow)

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-025, TEXHOLKERPRIGAMTOU-026, TEXHOLKERPRIGAMTOU-027
**Blocks**: TEXHOLKERPRIGAMTOU-030, TEXHOLKERPRIGAMTOU-031

## 1) What needs to change / be added

1. Implement a definite-binding dataflow model in compiler lowering (`src/cnl/compile-effects.ts`) so binding references are accepted only when statically guaranteed on all reachable paths.
2. Introduce explicit branch-merge semantics for `if`:
- post-`if` bindings are intersection of branch-guaranteed bindings
- missing `else` must be treated as a fallthrough path with no branch-local guarantees.
3. Define and implement conservative rules for control-flow exporters (`forEach`, `reduce`, `removeByPriority`, `evaluateSubset`, `rollRandom`) so only guaranteed bindings are exported sequentially.
4. Extend binder metadata/utility logic (`src/cnl/binder-surface-registry.ts`) to distinguish declared/possible binders from definitely-guaranteed binders where needed.
5. Add deterministic compiler diagnostics for conditionally-unbound references (distinct from plain unknown binding typos), including exact path and nearest in-scope guaranteed candidates.
6. Keep implementation fully game-agnostic and compiler-centric; do not add FITL/Texas branches.

## 2) Invariants that should pass

1. Any binding reference accepted by compiler is statically guaranteed to exist at use-site across all reachable control-flow paths.
2. Branch-local binders are not visible after merges unless guaranteed by all merge paths.
3. Diagnostic ordering and content remain deterministic for equivalent docs.
4. No game-specific exceptions exist in compiler binding-liveness logic.
5. Runtime `MISSING_BINDING` errors are eliminated for statically knowable binding-liveness cases covered by the compiler contract.

## 3) Tests that should pass

1. Unit: compile binding tests for `if` merge semantics:
- binder only in `then` -> compile error on post-`if` reference
- binder in both branches -> compile success
- no `else` + branch binder -> compile error on post-`if` reference.
2. Unit: control-flow exporter guarantee tests for loops/reducers/subset/remove-by-priority covering zero-iteration and partial-path scenarios.
3. Unit: binder-surface/dataflow tests proving guaranteed-binding export sets are deterministic.
4. Integration: malformed specs that previously failed at runtime with `MISSING_BINDING` now fail at compile with precise diagnostics.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
