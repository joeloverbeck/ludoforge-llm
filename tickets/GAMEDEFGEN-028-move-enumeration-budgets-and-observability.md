# GAMEDEFGEN-028: Move Enumeration Budgets and Observability Controls

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What must be added/fixed

1. Add configurable safety budgets for move enumeration and decision-sequence probing (max templates, max param expansions, max probe steps, max deferred predicates).
2. Surface structured diagnostics/telemetry when budgets are hit so specs can be tuned rather than silently timing out.
3. Ensure deterministic truncation behavior when budgets are reached.
4. Document budget semantics as engine-generic constraints for future large game specs.

## 2) Invariants that must pass

1. Enumeration remains deterministic given same state/seed/config.
2. Budget enforcement never produces malformed moves; it yields explicit bounded outputs with diagnostics.
3. Small/normal specs remain unaffected under default budgets.
4. Large branching specs fail fast with actionable diagnostics rather than uncontrolled explosion.

## 3) Tests that must pass

1. Unit: deterministic budget cutoff behavior for param enumeration and decision probing.
2. Unit: diagnostics emitted with stable codes and payloads when each budget threshold is exceeded.
3. Property/integration: representative high-branching fixtures complete within bounds and produce stable outputs.
4. Regression: existing legal move and decision sequence suites pass under default config.
