# GAMEDEFGEN-020: Typed Runtime Error Context Contracts by Error Code

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Replace untyped runtime error context usage (`Record<string, unknown>`) with code-specific typed context contracts.
2. Define a canonical type map keyed by `KernelRuntimeErrorCode` that describes required/optional context fields per code.
3. Refactor runtime error constructors/helpers (`kernelRuntimeError`, `illegalMoveError`, selector/pipeline error helpers) to emit contexts conforming to code-specific contracts.
4. Keep contracts engine-generic and reusable across games; do not encode game-specific assumptions in error context types.

## 2) Invariants That Should Pass

1. Every emitted runtime error context is statically tied to its `KernelRuntimeErrorCode`.
2. Required context fields are always present for each code; no ad hoc/shape-drifting context payloads.
3. Existing runtime behavior and error semantics remain stable (only typing/contract hardening changes).
4. Runtime error contracts remain generic and independent of game-specific identifiers.

## 3) Tests That Should Pass

1. Unit: type-level and runtime tests verify each error helper emits the expected code-specific context shape.
2. Unit: selector/pipeline/illegal-move runtime errors continue to expose deterministic metadata under typed contracts.
3. Integration: legality and selector runtime error flows continue to pass with typed contexts.
4. Regression: existing runtime error and legality/selector suites pass without behavioral regressions.

