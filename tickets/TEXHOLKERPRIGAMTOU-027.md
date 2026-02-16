# TEXHOLKERPRIGAMTOU-027: Static Binding Liveness & Reachability Validation in Compile/Cross-Validate

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-025, TEXHOLKERPRIGAMTOU-026
**Blocks**: none

## 1) What needs to change / be added

1. Add a static binding-liveness validation pass in compile/cross-validate that detects unresolved, out-of-scope, or unreachable binding references before runtime.
2. Validate binding availability across nested control-flow/effect graphs, including `let`, `if`, `forEach`, `reduce`, and effect-produced binders.
3. Emit deterministic, actionable diagnostics with exact path + missing binding id + nearest in-scope candidates.
4. Ensure validation is generic and graph-based, not game-specific.
5. Block compilation on binding-liveness violations (no runtime-only discovery of these issues).

## 2) Invariants that should pass

1. Any binding reference in compiled GameDef is statically proven reachable/in-scope under declared binding lifecycle semantics.
2. Equivalent docs produce deterministic diagnostic ordering/content.
3. Control-flow merges preserve conservative correctness (no false negatives for missing bindings).
4. Runtime missing-binding errors for statically knowable cases are eliminated.
5. Validation remains game-agnostic and data-driven.

## 3) Tests that should pass

1. Unit: positive/negative binding-liveness cases for each control-flow construct.
2. Unit: branch-merge cases (binding present in one branch, absent in another) with deterministic diagnostics.
3. Unit: effect-produced binder references across nested scopes.
4. Integration: malformed fixture that previously failed at runtime now fails at compile/cross-validate with precise diagnostics.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
