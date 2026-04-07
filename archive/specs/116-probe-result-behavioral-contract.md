# Spec 116 — Probe Result Behavioral Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel discovery subsystem refactoring
**Deps**: None (can be implemented independently of other specs)

## Problem

The `ProbeResult` type (`probe-result.ts`) defines three possible outcomes — `legal`, `illegal`, `inconclusive` — but provides no behavioral contract for what callers should do with each outcome. The result is that 6 consumer files independently re-implement the "inconclusive -> degrade/skip/permit" fallback chain with slightly different logic across 12 total sites.

Additionally, `ProbeResult` uses optional fields (`value?: T`, `reason?: ProbeInconclusiveReason`) rather than a proper discriminated union, preventing TypeScript from narrowing the type automatically in `switch`/`if` blocks and forcing consumers to use non-null assertions or casts.

**Evidence** (from missing-abstractions report, 2026-04-07):
- `legal-choices.ts` has 4 separate `outcome === 'inconclusive'` checks, each setting `legality = 'unknown'`
- `choose-n-option-resolution.ts` has 4 parallel checks with the same pattern
- `move-decision-sequence.ts:202` has a one-liner: `result.outcome === 'inconclusive' ? 'unknown' : result.value!`
- `action-pipeline-predicates.ts:57` and `pipeline-viability-policy.ts:143` both return `'deferred'`
- `legal-moves.ts:547` falls back to `state.activePlayer` — a distinct strategy
- The classification (error -> inconclusive) is centralized in `missing-binding-policy.ts`, but the response (inconclusive -> action) is scattered

**Why this matters**: Every new feature that adds a discovery-time probe must independently discover and re-implement the inconclusive-handling pattern. A single policy inversion (e.g., "treat ownerMismatch as illegal instead of unknown") would require modifying 6 files across 12 sites.

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| Foundation 5 One Rules Protocol | Satisfied (no sim compensations) | Unchanged |
| Foundation 8 Determinism | Satisfied (all fallbacks deterministic) | Unchanged (same behavior, just centralized) |
| Foundation 10 Bounded Computation | Budget-driven degradation is correct | Budget degradation preserved; centralized policy validates it |
| Foundation 15 Architectural Completeness | Strained: 6 files re-implement the same fallback chain; ProbeResult uses optional fields instead of discriminated union | Single policy point for inconclusive -> action mapping; proper DU eliminates type assertions |

### Game-Agnosticism

The probe result protocol is game-agnostic. It governs how the kernel handles uncertainty during move enumeration regardless of the specific game being played. No game-specific identifiers, rules, or payloads are involved.

## What to Change

### 1. Refactor `ProbeResult` to a discriminated union in `probe-result.ts`

Replace the current single-interface shape with a proper discriminated union so TypeScript can narrow the type automatically:

```typescript
/** Probe outcome: the probe resolved to a definite legal value. */
export interface ProbeResultLegal<T> {
  readonly outcome: 'legal';
  readonly value: T;
}

/** Probe outcome: the probe resolved to definite illegality. */
export interface ProbeResultIllegal {
  readonly outcome: 'illegal';
}

/** Probe outcome: the probe could not resolve definitively. */
export interface ProbeResultInconclusive {
  readonly outcome: 'inconclusive';
  readonly reason?: ProbeInconclusiveReason;
}

/** A probe result is one of three discriminated outcomes. */
export type ProbeResult<T = void> =
  | ProbeResultLegal<T>
  | ProbeResultIllegal
  | ProbeResultInconclusive;
```

This eliminates the need for `result.value!` or `result.value as T` casts — in `case 'legal'`, TypeScript knows `result.value` is `T`.

### 2. Add `resolveProbeResult()` utility in `probe-result.ts`

Add a resolution function that encapsulates the behavioral policy pattern:

```typescript
/** Map a ProbeResult to a concrete value using a policy. */
export type ProbeResultPolicy<T, TFallback> = {
  readonly onLegal: (value: T) => TFallback;
  readonly onIllegal: () => TFallback;
  readonly onInconclusive: (reason: ProbeInconclusiveReason | undefined) => TFallback;
};

export const resolveProbeResult = <T, TFallback>(
  result: ProbeResult<T>,
  policy: ProbeResultPolicy<T, TFallback>,
): TFallback => {
  switch (result.outcome) {
    case 'legal': return policy.onLegal(result.value);
    case 'illegal': return policy.onIllegal();
    case 'inconclusive': return policy.onInconclusive(result.reason);
  }
};
```

Note: no pre-built policy constants. Each consumer provides an inline policy matching its specific behavioral needs.

### 3. Replace scattered `outcome === 'inconclusive'` checks with `resolveProbeResult()`

For each consumer, replace the ad-hoc inconclusive handling with a call to `resolveProbeResult()` using an inline policy. The behavioral outcome MUST be identical — this is a pure refactoring with no semantic change.

**Consumer migration table**:

| File | Sites | Current behavior | Target policy |
|------|-------|-----------------|---------------|
| `legal-choices.ts` | 4 | `legality = 'unknown'` | Inline policy: `onInconclusive: () => 'unknown'` |
| `choose-n-option-resolution.ts` | 4 | `legality = 'unknown'`, `kind: 'ambiguous'` | Inline policy: `onInconclusive: () => 'unknown'` or context-specific |
| `move-decision-sequence.ts` | 1 | `'unknown'` | Inline policy: `onInconclusive: () => 'unknown'` |
| `action-pipeline-predicates.ts` | 1 | `'deferred'` | Inline policy: `onInconclusive: () => 'deferred'` |
| `pipeline-viability-policy.ts` | 1 | `'deferred'` | Inline policy: `onInconclusive: () => 'deferred'` |
| `legal-moves.ts` | 1 | fallback to `state.activePlayer` | Inline policy with context-specific fallback |

### 4. Do NOT change `ProbeOutcome` or `ProbeInconclusiveReason`

The existing outcome/reason types are well-scoped. No new outcomes or reasons are introduced. The change is in how `ProbeResult` is structured (DU instead of optional fields) and how consumers handle outcomes (centralized policy instead of scattered checks).

### 5. Do NOT force all consumers to use the same policy

Some consumers (e.g., `legal-moves.ts:547` with its `state.activePlayer` fallback) have legitimately different strategies. The policy pattern supports this — it does not enforce a single behavior.

## Files to Touch

**Modify**:
- `packages/engine/src/kernel/probe-result.ts` — refactor to discriminated union; add `ProbeResultPolicy`, `resolveProbeResult()`
- `packages/engine/src/kernel/legal-choices.ts` — replace 4 `outcome === 'inconclusive'` sites; update type usage for DU
- `packages/engine/src/kernel/choose-n-option-resolution.ts` — replace 4 sites; update type usage for DU
- `packages/engine/src/kernel/move-decision-sequence.ts` — replace 1 site; update type usage for DU
- `packages/engine/src/kernel/action-pipeline-predicates.ts` — replace 1 site; update type usage for DU
- `packages/engine/src/kernel/pipeline-viability-policy.ts` — replace 1 site; update type usage for DU
- `packages/engine/src/kernel/legal-moves.ts` — replace 1 site; update type usage for DU
- `packages/engine/src/kernel/missing-binding-policy.ts` — update ProbeResult construction to use DU variant shapes
- `packages/engine/src/kernel/index.ts` — re-export new symbols (`ProbeResultLegal`, `ProbeResultIllegal`, `ProbeResultInconclusive`, `ProbeResultPolicy`, `resolveProbeResult`)

**New**:
- `packages/engine/test/unit/kernel/probe-result-policy.test.ts` — unit tests for `resolveProbeResult()` and DU type narrowing

## Out of Scope

- Changing the `ProbeOutcome` or `ProbeInconclusiveReason` types
- Changing the `classifyMissingBindingProbeError()` classification logic
- Changing the `shouldDeferMissingBinding()` policy
- Modifying how errors are thrown or caught — this spec addresses outcome handling, not error classification
- Budget-driven degradation in `decision-sequence-satisfiability.ts` — this is architecturally sound (Foundation 10) and uses `'unknown'` classification directly, not `ProbeResult`

## Acceptance Criteria

### Tests

1. **`resolveProbeResult()` unit tests**: Each outcome calls the correct policy callback with the correct arguments.
2. **DU type narrowing**: Verify that in a `switch (result.outcome)` block, `result.value` is accessible without assertion in the `'legal'` case and `result.reason` is accessible in the `'inconclusive'` case (compile-time verification via test code that would fail `tsc` if narrowing were broken).
3. **Behavioral identity**: Every migrated consumer produces identical results before and after the change. Verified by full test suite passing with zero diff in any test output.
4. **Full test suite**: All existing tests pass with zero failures.
5. **Determinism canary**: Seeds 1001-1004 produce identical outcomes.

### Invariants

- No new `outcome === 'inconclusive'` checks appear in consumer files after migration (enforced by grep).
- `resolveProbeResult()` is the canonical way to handle probe results. Direct `outcome` checks are permitted only in `probe-result.ts` itself.
- All ProbeResult construction sites use the correct DU variant shape (e.g., `{ outcome: 'legal', value: x }` not `{ outcome: 'legal', value: x, reason: undefined }`).

## Test Plan

1. Write unit tests for `resolveProbeResult()` and DU type narrowing.
2. Refactor `ProbeResult` to discriminated union in `probe-result.ts`.
3. Update `missing-binding-policy.ts` construction sites to use DU shapes.
4. Migrate one consumer file (e.g., `move-decision-sequence.ts` — simplest, 1 site).
5. Run full test suite to verify behavioral identity.
6. Migrate remaining consumer files one at a time, running tests after each.
7. Run determinism canary tests.
8. Grep for remaining `outcome === 'inconclusive'` in consumer files — should be zero.
