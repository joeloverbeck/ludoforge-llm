# Spec 119 — evalCondition/evalQuery Result-Returning Migration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel eval subsystem signature change + all consumers
**Deps**: Spec 118 (probe boundary catch-to-result migration) must be complete (it is).
**Design**: docs/plans/2026-04-07-eval-result-returning-migration-design.md

## Problem

`evalCondition` returns `boolean` and `evalQuery` returns `readonly QueryResult[]`. Both communicate errors by throwing. In normal execution contexts, errors are genuine bugs (bad GameDef or kernel defect). But in probe execution contexts — where evaluation is speculative with incomplete bindings — errors are expected. This makes thrown exceptions a control-flow mechanism in probe paths, forcing callers to wrap calls in try-catch blocks.

Spec 118 centralized the catch-classify-defer pattern with `probeWith<T>` and migrated Groups A-B, but Groups C-D were deferred because the underlying eval functions still throw. The catch blocks in Group C (zone filter evaluation) and the heuristic fallback in Group D (`hasTransportLikeStateChangeFallback`) exist solely because `evalCondition` and `evalQuery` throw instead of returning result types.

**Evidence**:

| Metric | Count |
|--------|-------|
| `evalCondition` call sites | 31 |
| `evalQuery` call sites | 20 |
| Sites with no error handling (normal execution) | 44 |
| Sites with try-catch or probeWith (probe execution) | 4 |
| Sites with try-catch for graceful degradation (condition-annotator) | 3 |
| Files consuming eval functions | ~26 |

The 44 unwrapped sites never handle errors because in their context, errors should not occur. The 4 probe-context wrapped sites exist because probes can trigger evaluation failures that are expected, not exceptional. An additional 3 sites in `condition-annotator.ts` use try-catch for graceful UI degradation — they return fallback annotations on eval failure rather than propagating errors.

**Why this matters**: FOUNDATIONS F15 (Architectural Completeness) requires solutions that address root causes. The root cause is that `evalCondition`/`evalQuery` lack a result-type return path. Every new probe feature must rediscover the try-catch pattern. Making eval functions result-returning eliminates the entire class of probe-context catch blocks and unblocks the choice validation migration (Spec 120).

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| F5 One Rules Protocol | Satisfied | Unchanged — same functions, same semantics |
| F8 Determinism | Satisfied | Unchanged — `unwrapEval*` preserves throw behavior for bugs; result path preserves deterministic error handling |
| F10 Bounded Computation | Satisfied | Unchanged |
| F11 Immutability | Satisfied | Unchanged — result types are readonly |
| F14 No Backwards Compatibility | N/A | Full migration — one function signature, no dual variants, no shims |
| F15 Architectural Completeness | Strained: eval functions throw, probe callers catch | Eval functions return result types; probe callers pattern-match |
| F16 Testing as Proof | Catch-site tests assert error classification | Tests migrated to assert result-type matching |
| F17 Strongly Typed Domain IDs | Satisfied | Enhanced — `EvalErrorCode` provides typed error discrimination |

### Game-Agnosticism

All changes are in the generic kernel eval subsystem. No game-specific identifiers, rules, or payloads are involved.

## What to Change

### 1. Define Result Types

New file: `packages/engine/src/kernel/eval-result.ts`

Prerequisite: export `QueryResult` from `eval-query.ts` (currently a local type at line 39).

```typescript
import type { QueryResult } from './eval-query.js';
import type { EvalError } from './eval-error.js';

/** Discriminated union for evalCondition outcomes. */
export type EvalConditionResult =
  | { readonly outcome: 'success'; readonly value: boolean }
  | { readonly outcome: 'error'; readonly error: EvalError }

/** Discriminated union for evalQuery outcomes. */
export type EvalQueryResult =
  | { readonly outcome: 'success'; readonly value: readonly QueryResult[] }
  | { readonly outcome: 'error'; readonly error: EvalError }

// Factory function
export function evalSuccess<T extends boolean | readonly QueryResult[]>(
  value: T
): { readonly outcome: 'success'; readonly value: T };

// Unwrap helpers for normal execution contexts
export function unwrapEvalCondition(result: EvalConditionResult): boolean;
export function unwrapEvalQuery(result: EvalQueryResult): readonly QueryResult[];
```

Design choices:
- `outcome` discriminator matches `ProbeResult<T>` convention from Spec 116
- Reuses existing `EvalError<C>` class from `eval-error.ts` — no new error types. Internal eval code continues using `createEvalError()`/`missingBindingError()`/`typeMismatchError()` etc. to build error instances, but returns them in result wrappers instead of throwing
- Existing `isEvalErrorCode()` infrastructure works directly on `result.error` for classification in probe contexts
- `unwrapEval*` throws `KernelRuntimeError` on error — preserves bug-detection semantics for normal callers
- No `evalError()` factory needed — existing factories in `eval-error.ts` suffice

### 2. Change evalCondition Signature

**File**: `packages/engine/src/kernel/eval-condition.ts`

```typescript
// BEFORE
export function evalCondition(cond: ConditionAST, ctx: ReadContext): boolean

// AFTER
export function evalCondition(cond: ConditionAST, ctx: ReadContext): EvalConditionResult
```

Internal changes:
- Replace `throw new EvalError(...)` / `throw createEvalError(...)` with `return { outcome: 'error', error: createEvalError(code, message, context) }`
- Propagate result through recursive calls (`and`, `or`, `not` branches): short-circuit on error
- `evalConditionTraced` gains matching signature change

### 3. Change evalQuery Signature

**File**: `packages/engine/src/kernel/eval-query.ts`

```typescript
// BEFORE
export function evalQuery(query: OptionsQuery, ctx: ReadContext): readonly QueryResult[]

// AFTER
export function evalQuery(query: OptionsQuery, ctx: ReadContext): EvalQueryResult
```

Same internal pattern: replace throws with result returns, propagate through recursive calls.

### 4. Migrate Normal Execution Call Sites (44 sites)

Mechanical transformation:

```typescript
// BEFORE
const passed = evalCondition(cond, ctx)

// AFTER
const passed = unwrapEvalCondition(evalCondition(cond, ctx))
```

```typescript
// BEFORE
const items = evalQuery(query, ctx)

// AFTER
const items = unwrapEvalQuery(evalQuery(query, ctx))
```

### 5. Migrate Probe Execution Call Sites (4 sites)

Replace try-catch/probeWith with result pattern-matching:

```typescript
// BEFORE (action-pipeline-predicates.ts:19)
return probeWith(() => evalCondition(condition, ctx), classifier)

// AFTER
const result = evalCondition(condition, ctx);
if (result.outcome === 'error') return classifier(result.error);
return { outcome: 'legal', value: result.value };
```

```typescript
// BEFORE (action-pipeline-predicates.ts:38)
try {
  return evalCondition(condition, ctx);
} catch (error) { ... }

// AFTER
const result = evalCondition(condition, ctx);
if (result.outcome === 'error') { /* handle */ }
return result.value;
```

### 5b. Migrate condition-annotator Graceful-Degradation Catch Sites (3 sites)

`condition-annotator.ts` has 3 try-catch-wrapped `evalCondition` calls (lines 66, 310, 459) that serve UI graceful degradation — they return fallback annotation values on eval failure, not probe error classification. These sites use result-type pattern-matching to return defaults, NOT `unwrapEval*` (which would throw):

```typescript
// BEFORE (condition-annotator.ts:66)
try {
  const passed = evalCondition(cond, evalCtx);
  return passed ? { result: 'pass', text: '✓' } : { result: 'fail', text: '✗' };
} catch { return { result: 'fail', text: '?' }; }

// AFTER
const result = evalCondition(cond, evalCtx);
if (result.outcome === 'error') return { result: 'fail', text: '?' };
return result.value ? { result: 'pass', text: '✓' } : { result: 'fail', text: '✗' };
```

### 6. Eliminate Group C Catch Blocks (2 sites from Spec 118)

**free-operation-zone-filter-probe.ts:43-49**: Replace MISSING_BINDING catch with result pattern-match on `evalCondition` result.

**free-operation-grant-authorization.ts:209-212**: Replace catch block with result pattern-match.

### 7. probeWith Stays

`probeWith` in `probe-result.ts` has 4 active callers. Only 1 (`action-pipeline-predicates.ts`) wraps `evalCondition` directly and is migrated by this spec. The other 3 callers (`legal-choices.ts` x2, `pipeline-viability-policy.ts`, `move-decision-sequence.ts`) wrap higher-level operations unrelated to eval signatures. `probeWith` is NOT deleted by this spec.

## Files Modified

| File | Change Type | Sites |
|------|-------------|-------|
| `eval-result.ts` | NEW | Result types, `evalSuccess` factory, unwrap helpers |
| `eval-condition.ts` | Signature change | Core + recursive |
| `eval-query.ts` | Signature change + export `QueryResult` | Core + recursive |
| `eval-value.ts` | unwrapEvalQuery | 4 |
| `effects-choice.ts` | unwrapEvalQuery | 3 |
| `effects-control.ts` | unwrapEvalCondition + unwrapEvalQuery | 3 |
| `effects-token.ts` | unwrapEvalCondition | 1 |
| `apply-move.ts` | unwrapEvalCondition | 2 |
| `legal-moves.ts` | unwrapEvalCondition | 2 |
| `legal-choices.ts` | unwrapEvalCondition | 2 |
| `terminal.ts` | unwrapEvalCondition | 3 |
| `action-pipeline-predicates.ts` | Result pattern-match | 2 |
| `apply-move-pipeline.ts` | Result pattern-match | 1 |
| `condition-annotator.ts` | Mixed (3 catch→result-match + 1 unwrap) | 4 evalCondition sites |
| `effect-compiler-codegen.ts` | unwrapEvalCondition + unwrapEvalQuery | 5 |
| `event-execution.ts` | unwrapEvalCondition | 1 |
| `free-operation-grant-authorization.ts` | Result pattern-match (Group C) | 1 |
| `free-operation-viability.ts` | unwrapEvalCondition | 1 |
| `free-operation-zone-filter-probe.ts` | Result pattern-match (Group C) | 1 |
| `declared-action-param-domain.ts` | unwrapEvalQuery | 1 |
| `effects-subset.ts` | unwrapEvalQuery | 1 |
| `first-decision-compiler.ts` | unwrapEvalQuery | 1 |
| `spatial.ts` | unwrapEvalCondition | 1 |
| `probe-result.ts` | No change — probeWith stays (3 non-eval callers remain) | — |

## Verification

1. **Compiler-enforced completeness**: Changing return type from `boolean` to `EvalConditionResult` makes TypeScript flag every unconverted call site. No site can be missed.
2. **Regression tests**: All ~703 existing test files serve as regression coverage. Migration is mechanical — same behavior, different error channel.
3. **Determinism tests**: FITL canary seeds and replay tests confirm F8.
4. **Typecheck**: `pnpm turbo typecheck` passes with zero errors.
5. **Group C proof**: Grep for try-catch blocks in `free-operation-zone-filter-probe.ts` and `free-operation-grant-authorization.ts` — should find none for eval calls.

## Exclusions

- Choice validation throws in `effects-choice.ts` (32 sites) — deferred to Spec 120
- `hasTransportLikeStateChangeFallback` heuristic — deferred to Spec 120
- `evalConditionTraced` tracing infrastructure changes beyond signature alignment
