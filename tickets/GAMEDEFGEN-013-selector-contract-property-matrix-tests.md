# GAMEDEFGEN-013: Property-Based Selector Contract Matrix Coverage

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What To Fix / Add

1. Add property-based tests for selector contract matrices across actor/executor roles and binding declarations.
2. Generate selector/binding combinations to verify compile-time diagnostics and runtime contract behavior stay aligned.
3. Add deterministic ordering assertions for multi-diagnostic scenarios.
4. Ensure test generators remain generic and not tied to a specific game dataset.

## 2) Invariants That Should Pass

1. For any generated selector/binding combination, compiler and runtime boundaries agree on contract validity.
2. Invalid combinations always produce stable, deterministic diagnostics (including order when multiple violations exist).
3. Valid combinations never produce selector contract diagnostics.
4. Test outcomes remain deterministic under fixed seeds.

## 3) Tests That Should Pass

1. Property unit: actor/executor selector role matrix over valid/invalid selector forms.
2. Property unit: binding presence/absence matrix for selector-bound actions.
3. Property unit: deterministic diagnostic ordering for multi-violation documents.
4. Regression: existing selector unit/integration suites continue to pass unchanged.
