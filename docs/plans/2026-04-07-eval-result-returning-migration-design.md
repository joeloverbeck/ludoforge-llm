# Design: Eval Result-Returning Migration

**Date**: 2026-04-07
**Origin**: reports/118PROBOUCAT-006-viability-heuristic-investigation.md
**Foundations alignment**: F15 (Architectural Completeness), F14 (No Backwards Compatibility), F8 (Determinism)

## Problem

The kernel uses thrown exceptions as control flow in probe contexts. When `evalCondition`/`evalQuery` fail during speculative evaluation (probing), callers catch the exception and fall back to heuristics or conservative defaults. This pattern appears in 42 catch blocks across 27 files.

The `hasTransportLikeStateChangeFallback` heuristic (free-operation-viability.ts:348-415) is the most visible symptom: it guesses state-change potential from move params when full effect execution fails on a choice validation error. The heuristic is deterministic and correct, but it's a workaround — not a root cause fix (F15 violation).

## Root Cause

`evalCondition` returns `boolean` and `evalQuery` returns `readonly QueryResult[]`. Errors are communicated by throwing. In normal execution this is fine (errors are genuine bugs). In probe execution, errors are expected (speculative evaluation with incomplete contexts), making throw-based error handling a control-flow mechanism.

## Solution: Two Staged Specs

### Spec 1: evalCondition/evalQuery Result-Returning

Change core signatures to return discriminated unions:

```typescript
type EvalConditionResult =
  | { readonly outcome: 'success'; readonly value: boolean }
  | { readonly outcome: 'error'; readonly error: EvalError }

type EvalQueryResult =
  | { readonly outcome: 'success'; readonly value: readonly QueryResult[] }
  | { readonly outcome: 'error'; readonly error: EvalError }

type EvalError = {
  readonly code: EvalErrorCode
  readonly message: string
  readonly context?: Record<string, unknown>
}
```

**Normal callers** (47/51 sites): Use `unwrapEvalCondition()`/`unwrapEvalQuery()` — extracts success value or throws (genuine bug semantics preserved).

**Probe callers** (4/51 sites): Pattern-match on `outcome` directly — clean result-type handling replaces try-catch.

**Consumer map**: 31 evalCondition sites (27 unwrapped, 3 try-catch, 1 probeWith) + 20 evalQuery sites (all unwrapped). ~24 files touched.

### Spec 2: Choice Validation Result-Returning (depends on Spec 1)

Convert 32 `CHOICE_RUNTIME_VALIDATION_FAILED` throw sites in `effects-choice.ts` to return result types. Propagate through `choose-n-option-resolution.ts` and `effects.ts`. Eliminate `hasTransportLikeStateChangeFallback` heuristic entirely.

## Design Decisions

1. **`unwrapEval*` is not a compatibility shim** — it's the correct semantic for "I expect success; failure is a bug." One function signature, not two (F14 satisfied).
2. **`outcome` discriminator field** — matches established `ProbeResult<T>` pattern.
3. **Typed error codes** (`EvalErrorCode`) — enables precise pattern matching, replaces unstructured thrown errors.
4. **Factory functions** (`evalSuccess`, `evalError`) — follows `ZoneFilterEvaluationResult` pattern.

## Verification

- **Compiler enforces completeness**: return type change flags every unconverted site
- **~703 test files** provide regression coverage (mechanical migration, same behavior)
- **Determinism tests** (FITL canary seeds, replay) prove F8 preserved
- **Post-Spec-2 grep** for `CHOICE_RUNTIME_VALIDATION_FAILED` throw sites = zero in non-test code
