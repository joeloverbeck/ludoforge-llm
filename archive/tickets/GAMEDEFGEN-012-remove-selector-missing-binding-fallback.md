# GAMEDEFGEN-012: Remove Missing-Binding Fallback for Selector Resolution

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Small-Medium

## 0) Reassessed Assumptions (2026-02-15)

1. The missing-binding fallback is **not** currently a global legality policy. It is wired through `allowMissingBindingFallback` and actively used in `legalMoves` action-param enumeration (`resolveActionExecutor(..., allowMissingBindingFallback: true)`).
2. `legalChoices` and `applyMove` already default to strict selector behavior and project missing-binding executor resolution as runtime contract invalidation (no enabled fallback path in those call sites).
3. Existing tests cover resolver-level fallback toggling (`action-executor.test.ts`) and general selector-contract errors, but do not explicitly lock in strict no-fallback behavior for the `legalMoves` enumeration path where bindings are missing during resolution.

## 1) Updated Scope (Ticket-Corrected)

1. Remove `allowMissingBindingFallback` from selector-driven executor resolution APIs and call sites.
2. Enforce strict executor selector contract everywhere: unresolved binding must deterministically produce invalid-selector runtime contract behavior.
3. Keep legality surface behavior aligned by eliminating silent fallback semantics from `legalMoves` while preserving existing strict behavior in `legalChoices` and `applyMove`.
4. Keep the policy engine-generic and compatibility-free (no alias paths or legacy fallback).

## 2) Architectural Rationale

1. Removing fallback is an architectural improvement over the current design because it deletes implicit context-dependent behavior (same selector yielding different semantics based on a hidden flag).
2. A single strict selector contract reduces branching in executor/preflight code and makes legality surfaces easier to reason about, test, and extend.
3. This change intentionally favors deterministic runtime contracts over permissive inference; callers must provide complete bindings or receive explicit contract errors.

## 3) Invariants That Should Pass

1. Missing selector bindings never resolve by fallback; they always surface as explicit contract violations.
2. No execution surface contains a code path that silently substitutes `decisionPlayer` for missing selector bindings.
3. Valid, fully-bound action behavior does not regress.
4. Deterministic error identity and context metadata are preserved.

## 4) Tests That Should Pass

1. Unit: `resolveActionExecutor` no longer supports fallback; missing required binding returns `invalidSpec`.
2. Unit: `legalMoves` throws runtime contract invalid for executor selectors that reference declared-but-unbound bindings during enumeration.
3. Unit: selector contract error projection across `legalChoices`, `legalMoves`, and `applyMove` remains stable.
4. Integration/regression: representative compile+play flows with valid bindings continue to pass.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Removed `allowMissingBindingFallback` from `resolveActionExecutor`, `resolveActionApplicabilityPreflight`, and all call sites.
  - `legalMoves` executor resolution now uses strict selector resolution only (no decision-player fallback).
  - Updated strictness tests in `test/unit/kernel/action-executor.test.ts`.
  - Added/updated missing-binding strictness coverage in `test/unit/kernel/legal-moves.test.ts` and `test/unit/action-executor-binding.test.ts`.
- Deviations from original plan:
  - Scope was corrected first because fallback usage was narrower than originally assumed (primarily `legalMoves` enumeration path).
  - One additional existing unit test outside kernel folder (`action-executor-binding`) required update to remove legacy fallback expectations.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:all` passed.
