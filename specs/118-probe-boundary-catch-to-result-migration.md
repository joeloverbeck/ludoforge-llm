# Spec 118 — Probe Boundary Catch-to-Result Migration

**Status**: DRAFT
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — kernel probe subsystem refactoring
**Deps**: Spec 116 (ProbeResult behavioral contract) and Spec 117 (ZoneFilterEvaluationResult) must be complete (both are).

## Problem

The kernel's speculative probe evaluation — used during move enumeration to determine whether free-operation grants have viable completions — relies on a catch-classify-defer pattern scattered across 15 catch blocks in 9 files. Each site wraps a throwing function in try-catch, calls a classifier (`classifyMissingBindingProbeError`, `classifyDiscoveryProbeError`, `classifyChoiceProbeError`, `isRecoverableEvalResolutionError`), and either returns a fallback value or re-throws.

Specs 116 and 117 established the result-type direction: `ProbeResult<T>` (legal/illegal/inconclusive) and `ZoneFilterEvaluationResult` (resolved/deferred/failed). But the underlying evaluation functions still throw — callers must still wrap them in try-catch. The migration is incomplete.

**Evidence** (from `reports/missing-abstractions-2026-04-07-fitl-policy-agent-canary.md`):

| File | Lines | Classifier | Returns |
|------|-------|-----------|---------|
| `legal-choices.ts` | 278-284 | `classifyDiscoveryProbeError` | ProbeResult |
| `legal-choices.ts` | 304-310 | `classifyDiscoveryProbeError` | ProbeResult |
| `legal-choices.ts` | 330-336 | `classifyChoiceProbeError` | ProbeResult |
| `legal-choices.ts` | 348-354 | `classifyChoiceProbeError` | ProbeResult |
| `pipeline-viability-policy.ts` | 115-122 | `classifyMissingBindingProbeError` | ProbeResult |
| `action-pipeline-predicates.ts` | 23-31 | `classifyMissingBindingProbeError` | ProbeResult |
| `move-decision-sequence.ts` | 68-73 | `classifyMissingBindingProbeError` | ProbeResult |
| `eval-query.ts` | 44-51 | `isRecoverableEvalResolutionError` | `null` |
| `eval-query.ts` | 585-591 | `isRecoverableEvalResolutionError` | `[]` |
| `legal-moves.ts` | 386-388 | None (bare catch) | `false` |
| `legal-moves.ts` | 685-689 | `isTurnFlowErrorCode(FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED)` | `true` |
| `free-operation-grant-authorization.ts` | 209-212 | `classifyError` | ZoneFilterEvaluationResult |
| `free-operation-viability.ts` | 587-591 | `isEffectRuntimeReason(CHOICE_RUNTIME_VALIDATION_FAILED)` | `hasTransportLikeStateChangeFallback()` |
| `legal-moves.ts` | 530 | None (bare catch) | keeps move |
| `free-operation-zone-filter-probe.ts` | 43-49 | `isEvalErrorCode(MISSING_BINDING)` | retry or `zoneFilterFailed` |

**Why this matters**: Every new feature that adds a discovery-time probe must rediscover the try-catch-classify pattern. The 15 sites use 5 different classifiers and return 4 different result shapes (ProbeResult, ZoneFilterEvaluationResult, plain boolean, plain null/[]). A single policy inversion or new error code requires visiting all 15 sites. FOUNDATIONS §15 (Architectural Completeness) is strained — the pattern addresses symptoms (thrown errors) rather than the root cause (functions that throw instead of returning result types).

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| F5 One Rules Protocol | Satisfied (zero sim compensations) | Unchanged |
| F8 Determinism | Satisfied (all fallbacks are deterministic) | Unchanged (same behavior, centralized) |
| F10 Bounded Computation | Satisfied (probe budgets cap evaluation) | Unchanged |
| F11 Immutability | Satisfied | Unchanged |
| F14 No Backwards Compatibility | N/A | Full migration per group — no shims |
| F15 Architectural Completeness | Strained: 15 catch blocks re-implement the same pattern with 5 classifiers and 4 result shapes | Evaluation functions return result types; catch blocks eliminated |
| F16 Testing as Proof | Catch-site tests assert error classification | Tests migrated to assert result-type returns |

### Game-Agnosticism

All changes are in the generic kernel probe subsystem. No game-specific identifiers, rules, or payloads are involved.

## What to Change

The 15 catch blocks fall into four groups by migration strategy:

### Group A: ProbeResult callers (7 sites, 5 files)

These already return `ProbeResult<T>`. They wrap a throwing function in try-catch and call a classifier that returns `ProbeResult | null`. The pattern is identical across all 7:

```typescript
// BEFORE (repeated 7 times)
try {
  return { outcome: 'legal', value: innerFn() };
} catch (error) {
  const classified = classifyXxxProbeError(error);
  if (classified !== null) return classified;
  throw error;
}
```

**Migration**: Extract a generic probe wrapper:

```typescript
// probe-result.ts (new export)
export const probeWith = <T>(
  fn: () => T,
  classifier: (error: unknown) => ProbeResult<never> | null,
): ProbeResult<T> => {
  try {
    return { outcome: 'legal', value: fn() };
  } catch (error: unknown) {
    const classified = classifier(error);
    if (classified !== null) return classified;
    throw error;
  }
};
```

Then each call site becomes a one-liner:

```typescript
// AFTER (single-param classifier — classifyDiscoveryProbeError, classifyChoiceProbeError)
return probeWith(
  () => applyEffects(effects, createDiscoveryStrictEffectContext(baseContext)),
  classifyDiscoveryProbeError,
);
```

**Note on multi-param classifiers**: `classifyMissingBindingProbeError` takes `(error, context: MissingBindingPolicyContext)` — two parameters. Call sites using it must curry the context:

```typescript
// AFTER (multi-param classifier — closure wraps the context)
return probeWith(
  () => resolveExecutionPlayer(action, def, state, seatResolution, evalRuntimeResources),
  (e) => classifyMissingBindingProbeError(e, MISSING_BINDING_POLICY_CONTEXTS.ACTION_PIPELINE_PREDICATES),
);
```

**Files to modify**:
- `packages/engine/src/kernel/probe-result.ts` — add `probeWith` export
- `packages/engine/src/kernel/legal-choices.ts` — replace 4 catch blocks
- `packages/engine/src/kernel/pipeline-viability-policy.ts` — replace 1 catch block
- `packages/engine/src/kernel/action-pipeline-predicates.ts` — replace 1 catch block
- `packages/engine/src/kernel/move-decision-sequence.ts` — replace 1 catch block

**Blast radius note**: `classifyMissingBindingProbeError` is also called at `legal-moves.ts:451` outside a catch block (classifying `resolution.error` from a result object). This is not a catch site, but it is a consumer of the classifier — any signature or location change to the classifier affects this call site.

### Group B: Plain-value callers (5 sites, 3 files)

These return plain values (`null`, `[]`, `false`, `true`) instead of ProbeResult. They call `isRecoverableEvalResolutionError` or error-code checks directly.

**Migration**: Add typed `tryEvalValue` / `tryEvalCondition` wrappers to `eval-query.ts` that return `T | null` (for single values) or `readonly T[]` (for collections) instead of throwing on recoverable errors. Each wrapper internalizes the try-catch and classifier:

```typescript
// eval-query.ts (new export)
export const tryResolveIntDomainBound = (
  bound: NumericValueExpr,
  ctx: ReadContext,
): number | null => {
  try {
    const value = typeof bound === 'number' ? bound : evalValue(bound, ctx);
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
  } catch (error) {
    if (isRecoverableEvalResolutionError(error)) return null;
    throw error;
  }
};
```

For `legal-moves.ts:386` (bare catch returning `false`): Investigate whether this is a genuine catch-all or a specific error class. If specific, add a typed wrapper. If it's a defensive bare catch, document why and leave it — bare catches that silently swallow unknown errors are a correctness risk.

For `legal-moves.ts:530` (bare catch keeping the move): This catch swallows all probe errors during plain-action effect evaluation, treating any error as "unknown viability — keep the move." The comment says effects may reference runtime state not available during discovery. Same investigation as line 386: determine whether this should classify specific error codes or remain a defensive catch-all.

For `legal-moves.ts:685` (zone filter error → `true`): This should migrate to use `ZoneFilterEvaluationResult` from the zone-filter probe function, eliminating the catch entirely.

**Files to modify**:
- `packages/engine/src/kernel/eval-query.ts` — internalize 2 catch blocks into result-returning functions
- `packages/engine/src/kernel/legal-moves.ts` — investigate bare catches (lines 386, 530); migrate zone-filter catch (line 685) to use ZoneFilterEvaluationResult

### Group C: Already migrated (2 sites, 2 files)

- `free-operation-zone-filter-probe.ts:43-49` — Uses `zoneFilterFailed()` / `zoneFilterResolved()` from ZoneFilterEvaluationResult. The catch block remains because the inner `evalCondition` still throws, but the result construction is correct.
- `free-operation-grant-authorization.ts:209-212` — Uses `classifyError` returning ZoneFilterEvaluationResult.

**Migration**: These become catch-free once their inner evaluation functions (`evalCondition`) gain result-returning variants. This is a stretch goal — the inner evaluation functions are used pervasively and making them result-returning is a larger change. Mark as **deferred** unless the `evalCondition` migration becomes tractable during implementation.

### Group D: Heuristic fallback — Investigation required (1 site)

`free-operation-viability.ts:587-591` catches `CHOICE_RUNTIME_VALIDATION_FAILED` and falls back to `hasTransportLikeStateChangeFallback()` — a 68-line heuristic that inspects move params for zone/token selections to guess whether a move would change game state.

This is architecturally distinct from Groups A-C:
- Groups A-C handle **missing bindings** during discovery (bindings not yet resolved)
- Group D handles **choice validation failure** during viability probing (a choice sub-decision fails validation mid-execution)

**Investigation questions**:
1. Can the viability probe be restructured to evaluate state-change potential *before* hitting choice validation? (e.g., by running effects up to the first choice point and checking for token movement)
2. Is `hasTransportLikeStateChangeFallback` empirically correct? Run the FITL canary seeds with and without it to measure divergence.
3. Can the choice validation error be made recoverable by returning a partial execution result that includes "effects applied so far"?

**Recommendation**: Defer Group D to a follow-up investigation. The heuristic is deterministic and bounded — it doesn't violate F8 or F10. It strains F15 (symptom-level patch) but is functionally correct for the current game set.

## Migration Order

1. **Group A first** — highest value, lowest risk. The `probeWith` helper is a pure addition to `probe-result.ts`. Each call site replacement is mechanical.
2. **Group B second** — moderate complexity. The `eval-query.ts` wrappers are localized. The `legal-moves.ts` investigation may reveal additional work.
3. **Group C deferred** — blocked on `evalCondition` gaining a result-returning variant, which is a broader change.
4. **Group D deferred** — needs investigation before a migration strategy can be designed.

## Verification

### Unit Tests

- **`probeWith` helper**: Test with a function that succeeds (returns `legal`), a function that throws a classified error (returns `inconclusive`), and a function that throws an unclassified error (re-throws).
- **Each migrated call site**: Existing tests should pass unchanged — the migration preserves behavior. Run the full test suite after each group.
- **`legal-moves.ts:386` bare catch**: Add a test that exercises the code path to verify what error class it catches.

### Integration Tests

- **FITL canary seeds**: Run `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` after each group to verify no determinism regression.
- **Full engine test suite**: `pnpm -F @ludoforge/engine test:all`

### Regression Guards

- After Group A: verify that `classifyDiscoveryProbeError` and `classifyChoiceProbeError` call counts match (same classifiers, just invoked through `probeWith` instead of inline catch).
- After Group B: verify that `isRecoverableEvalResolutionError` is no longer called in catch blocks in `eval-query.ts` — it should be internalized.

## Ticket Decomposition Guidance

Suggested ticket series prefix: `PROBOUND` (Probe Boundary)

| Ticket | Scope | Group |
|--------|-------|-------|
| PROBOUND-001 | Add `probeWith` helper to `probe-result.ts` + tests | A |
| PROBOUND-002 | Migrate `legal-choices.ts` 4 catch blocks to `probeWith` | A |
| PROBOUND-003 | Migrate `pipeline-viability-policy.ts`, `action-pipeline-predicates.ts`, `move-decision-sequence.ts` | A |
| PROBOUND-004 | Internalize `eval-query.ts` 2 catch blocks into result-returning functions | B |
| PROBOUND-005 | Investigate + migrate `legal-moves.ts` 3 catch blocks (lines 386, 530, 685) | B |
| PROBOUND-006 | Investigate `hasTransportLikeStateChangeFallback` viability probe restructuring | D |
