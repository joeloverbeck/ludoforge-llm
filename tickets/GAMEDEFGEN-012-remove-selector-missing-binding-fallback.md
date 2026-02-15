# GAMEDEFGEN-012: Remove Missing-Binding Fallback for Selector Resolution

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Small-Medium

## 1) What To Fix / Add

1. Remove `allowMissingBindingFallback` behavior from selector-driven execution paths (notably action executor resolution).
2. Enforce strict contract: missing selector binding is invalid and must fail deterministically.
3. Align legality surfaces (`legalChoices`, `legalMoves`, `applyMove`) so missing bindings cannot silently degrade into fallback semantics.
4. Keep the policy game-agnostic and compatibility-free (no alias paths or legacy fallback).

## 2) Invariants That Should Pass

1. Missing selector bindings never resolve by fallback; they always surface as explicit contract violations.
2. Legality/result surfaces report consistent reason taxonomy for this class of failure.
3. No valid, fully-bound action behavior regresses.
4. Deterministic error identity and context metadata are preserved.

## 3) Tests That Should Pass

1. Unit: selector executor/actor resolution fails deterministically when required binding is absent.
2. Unit: legality surface parity tests confirm identical failure semantics across `legalChoices`, `legalMoves`, and `applyMove`.
3. Unit: previously fallback-accepting paths are updated to assert strict failure.
4. Integration: representative compile+play flows with valid bindings continue to pass.
