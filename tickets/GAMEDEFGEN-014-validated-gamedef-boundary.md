# GAMEDEFGEN-014: Introduce Validated GameDef Boundary Type

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium-Large

## 1) What To Fix / Add

1. Introduce a branded/opaque validated `GameDef` boundary type produced by compiler/validation pipeline.
2. Update kernel entry points to prefer the validated type, reducing redundant runtime shape/contract checks for compiler-owned outputs.
3. Keep runtime guardrails only for externally constructed/non-validated `GameDef` objects.
4. Document and enforce explicit handoff contract between compiler and simulator layers.

## 2) Invariants That Should Pass

1. Compiler-produced validated `GameDef` can execute without re-validating compile-owned selector shape constraints.
2. Non-validated inputs still fail safely and deterministically at validation boundaries.
3. Type contracts remain game-agnostic and reusable.
4. No behavior changes for valid specs; only boundary clarity and safety improve.

## 3) Tests That Should Pass

1. Unit: validated `GameDef` construction/branding only succeeds after full validation.
2. Unit: kernel APIs accept validated `GameDef` and reject/route non-validated forms appropriately.
3. Integration: end-to-end compile->simulate flow passes through validated boundary with no regressions.
4. Regression: existing defensive runtime tests for malformed manual `GameDef` inputs still pass (at boundary points).
