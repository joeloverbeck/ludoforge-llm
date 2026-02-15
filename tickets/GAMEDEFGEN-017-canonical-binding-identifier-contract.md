# GAMEDEFGEN-017: Canonical Binding Identifier Contract Across Selectors and Refs

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Define one canonical binding identifier contract across action params, selector binding tokens, and `{ ref: binding, name: ... }` references.
2. Remove mixed-form tolerance (for example implicit equivalence between `$name` and `name`) and enforce one canonical format end-to-end.
3. Centralize binding-name validation and matching so compiler/lowering/cross-validation all use one shared rule.
4. Standardize diagnostics for binding-name contract violations (missing declaration, malformed token, format mismatch) with deterministic code/path ordering.
5. Keep contract generic and game-agnostic; do not create per-game binding conventions.

## 2) Invariants That Should Pass

1. Binding declaration and binding references match under exactly one canonical representation.
2. No implicit aliasing/transformation occurs between differently-formatted binding names.
3. Compiler and runtime-facing contract checks use the same canonical rule and produce deterministic outcomes.
4. Valid specs using canonical binding names compile unchanged.

## 3) Tests That Should Pass

1. Unit: canonical binding names pass through params/selectors/binding refs without normalization drift.
2. Unit: mismatched binding formats fail with deterministic diagnostics at precise paths.
3. Unit: selector contract checks (`bindingNotDeclared`, pipeline-related checks) operate on canonical names only.
4. Regression: existing binding and selector contract suites pass after canonicalization updates.
