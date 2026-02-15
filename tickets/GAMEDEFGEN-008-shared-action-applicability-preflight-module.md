# GAMEDEFGEN-008: Introduce Shared Action Applicability Preflight Module

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Create a reusable preflight module that centralizes common action applicability checks (phase, actor, executor, limits, and dispatchability prerequisites).
2. Use this preflight consistently in `legalMoves`, `legalChoices`, and `applyMove` to eliminate duplicated gate logic.
3. Define a typed preflight result contract consumed by all three entry points.
4. Preserve engine genericity: no game-specific hooks or branches in preflight logic.

## 2) Invariants That Should Pass

1. Applicability semantics are identical across `legalMoves`, `legalChoices`, and `applyMove` for equivalent state/action inputs.
2. Preflight outcomes are deterministic and independent of callsite-specific exception handling.
3. Duplicate logic across entry points is reduced without changing valid-game behavior.
4. Invalid-spec outcomes remain explicit and not silently ignored.

## 3) Tests That Should Pass

1. Unit: preflight module returns expected typed outcomes across representative action configurations.
2. Unit: parity tests verify `legalMoves`/`legalChoices`/`applyMove` agreement on action applicability decisions.
3. Regression unit: existing deterministic ordering and legality behavior remain unchanged for valid fixtures.
4. Integration: full relevant kernel + simulator suites pass.
