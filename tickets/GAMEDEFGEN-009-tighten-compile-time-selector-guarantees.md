# GAMEDEFGEN-009: Tighten Compile-Time Guarantees for Actor/Executor and Related Selectors

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Strengthen compiler/validation passes so malformed actor/executor selector forms are rejected earlier with precise diagnostics.
2. Ensure runtime-invalid selector states are minimized for compiled `GameDef` outputs.
3. Audit selector normalization and cross-validation paths to remove gaps that currently defer clearly invalid shapes to runtime.
4. Keep schema/type contracts game-agnostic and reusable.

## 2) Invariants That Should Pass

1. Clearly invalid selector forms are rejected at compile/validation time with actionable diagnostics.
2. Runtime `invalidSpec` cases for selector shape errors become rare invariant-break paths.
3. Valid selector forms continue compiling and executing unchanged.
4. Diagnostic paths/codes remain deterministic and stable.

## 3) Tests That Should Pass

1. Unit: compile/normalize tests for malformed actor/executor selector forms produce expected diagnostics.
2. Unit: cross-validation tests cover unsupported/missing binding declarations for selector-based bindings.
3. Regression unit: existing valid selector fixture golden outputs remain unchanged.
4. Integration: compile pipeline tests continue passing for valid GameSpecDoc inputs.
