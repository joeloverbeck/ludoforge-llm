# TEXHOLKERPRIGAMTOU-030: Strict-Binding Migration of Production Game Specs/YAML

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-029
**Blocks**: TEXHOLKERPRIGAMTOU-031

## 1) What needs to change / be added

1. Audit production and fixture GameSpec/YAML for patterns relying on conditional binding visibility after control-flow merges.
2. Refactor affected specs to satisfy definite-binding guarantees without aliasing or backward-compat exceptions.
3. Normalize branch-dependent logic by using explicit guaranteed bind initialization/assignment patterns (for example initialize before branch and update in all branches) where semantically correct.
4. Update any macro expansions/fixtures that currently emit conditionally-guaranteed binders.
5. Preserve engine-agnostic architecture: all behavior stays encoded in YAML/GameSpecDoc; compiler/runtime remain generic.

## 2) Invariants that should pass

1. All production game specs compile under strict definite-binding rules with zero conditional-binding diagnostics.
2. Refactored specs preserve gameplay behavior and determinism (seeded reproducibility unchanged except where bug fixes are intended and documented).
3. No compatibility aliases are introduced for old binding names/paths.
4. Data assets remain optional fixtures/reference artifacts, not required runtime compile inputs.

## 3) Tests that should pass

1. Integration: FITL production compilation and runtime suites remain green under strict compiler rules.
2. Integration: Texas runtime bootstrap and related suites remain green.
3. Integration: targeted regression tests for previously conditional-binding scenarios now expressed with guaranteed bindings.
4. Unit/Integration: macro compile tests remain green for nested macro-generated binders.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
