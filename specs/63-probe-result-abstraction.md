# Spec 63 — Probe Result Abstraction

**Status**: PROPOSED
**Priority**: MEDIUM
**Effort**: Medium (3-5 days)
**Engine Changes**: Yes — kernel probe/legality subsystem refactoring
**Deps**: None (independent of Spec 115, though both improve the same subsystem)
**Source**: `reports/missing-abstractions-2026-04-07-fitl-playbook-golden.md` Section 2

## Problem

The kernel performs speculative move evaluation ("probing") in 5 modules to determine whether a move is legal, completable, or viable — without committing to it. These probes throw exceptions on 3 categories of expected conditions, forcing each call site to independently catch and classify errors. There are **14 identical catch-and-recover blocks** across 5 files, all following the same pattern:

```typescript
try {
  result = evaluateProbeMove(probeMove);
} catch (error: unknown) {
  if (isChoiceDecisionOwnerMismatchDuringProbe(error)) {
    return { kind: 'ambiguous' };  // or 'unknown', etc.
  }
  throw error;
}
```

**Three error categories handled identically across all sites**:

| Category | Guard Function | Sites | Translation |
|----------|---------------|-------|-------------|
| Choice owner mismatch | `isChoiceDecisionOwnerMismatchDuringProbe` | 10 | → `unknown` / `ambiguous` |
| Missing binding | `shouldDeferMissingBinding` | 5 | → `unknown` / `deferred` |
| Stacking violation | `isEffectErrorCode('STACKING_VIOLATION')` | 2 | → `illegal` / `pipelineLegalityFailed` |

**Evidence**:
- `legal-choices.ts`: 6 catch blocks (lines 264, 290, 426, 453, 628, 652)
- `choose-n-option-resolution.ts`: 4 catch blocks (lines 280, 307, 437, 455)
- `pipeline-viability-policy.ts`: 2 catch blocks (line 122)
- `action-pipeline-predicates.ts`: 2 catch blocks (line 34)
- `move-decision-sequence.ts`: 1 catch block (line 174)
- `legal-moves.ts`: 1 catch block (line 449) — via `shouldDeferMissingBinding`

**Why this is a problem**:
1. Adding a new probe error category requires updating all 14 sites (fragile)
2. Forgetting to handle a category at a new call site produces a runtime crash instead of graceful degradation
3. The implicit state machine (`success | ownerMismatch | missingBinding | stackingViolation | otherError`) has no explicit type — it exists only in catch block patterns
4. Each site translates to a different domain-specific "inconclusive" status, obscuring that they all mean the same thing: "the probe was inconclusive"

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| §5 One Rules Protocol | Satisfied — probe errors are kernel-internal | Unchanged |
| §10 Bounded Computation | Satisfied — probes are bounded by enumeration budgets | Unchanged |
| §15 Architectural Completeness | **Violated** — 14 catch blocks are symptom patches for a missing result type | Satisfied — `ProbeResult` is the explicit contract |
| §8 Determinism | Satisfied — probe outcomes are deterministic | Unchanged |
| §11 Immutability | Satisfied — probes don't mutate state | Unchanged |

### Game-Agnosticism

The probe result abstraction is fully game-agnostic. Probing is a generic kernel operation: "can this move complete legally given current state?" No game-specific identifiers, rules, or conditions appear in the probe contract.

## What to Change

### 1. Introduce `ProbeOutcome` and `ProbeResult` types

New file: `packages/engine/src/kernel/probe-result.ts`

```typescript
/** Outcome of a speculative move evaluation. */
export type ProbeOutcome =
  | 'legal'           // Probe completed successfully; move is legal
  | 'illegal'         // Probe completed; move is definitively illegal
  | 'inconclusive'    // Probe could not determine legality (missing binding, owner mismatch, etc.)
  ;

/** Why a probe was inconclusive. */
export type ProbeInconclusiveReason =
  | 'ownerMismatch'         // Choice decision belongs to a different player during probe
  | 'missingBinding'        // A binding required for evaluation is not yet resolved
  | 'stackingViolation'     // Effect would violate stacking constraints
  | 'selectorCardinality'   // Selector cardinality unresolvable during probe
  ;

export interface ProbeResult<T = void> {
  readonly outcome: ProbeOutcome;
  readonly reason?: ProbeInconclusiveReason;
  /** Payload present when outcome is 'legal'. Shape varies by call site. */
  readonly value?: T;
}
```

The `T` generic allows each call site to carry its specific success payload (e.g., evaluated state + bindings for `legal-choices.ts`, resolved sequence for `move-decision-sequence.ts`).

### 2. Refactor probe functions to return `ProbeResult` instead of throwing

The core probe functions that currently throw on expected conditions must be changed to catch internally and return `ProbeResult`:

- The evaluation functions called within the 14 catch blocks (e.g., the pipeline evaluation in `legal-choices.ts`, the probe move evaluation in `choose-n-option-resolution.ts`) should be wrapped or refactored to return `ProbeResult`.
- The `isChoiceDecisionOwnerMismatchDuringProbe`, `shouldDeferMissingBinding`, and `isEffectErrorCode('STACKING_VIOLATION')` checks move **into** the probe functions, not at each call site.

### 3. Migrate all 14 catch sites to read `ProbeResult.outcome`

Each call site changes from:

```typescript
try {
  result = evaluateProbeMove(probeMove);
} catch (error: unknown) {
  if (isChoiceDecisionOwnerMismatchDuringProbe(error)) {
    return { kind: 'ambiguous' };
  }
  throw error;
}
```

To:

```typescript
const probed = evaluateProbeMove(probeMove);
if (probed.outcome === 'inconclusive') {
  return { kind: 'ambiguous' };
}
// probed.outcome === 'legal' → use probed.value
```

### 4. Consolidate error classification

- Delete `isChoiceDecisionOwnerMismatchDuringProbe` from `legal-choices.ts` — its logic is absorbed into probe internals
- The `shouldDeferMissingBinding` function in `missing-binding-policy.ts` remains as a utility but is no longer called at each probe site — it's called once inside the probe function
- The `isEffectErrorCode('STACKING_VIOLATION')` check moves into probe internals

### 5. Export `ProbeResult` from kernel index

Add `ProbeResult`, `ProbeOutcome`, and `ProbeInconclusiveReason` to `packages/engine/src/kernel/index.ts` exports.

## Files to Touch

**New**:
- `packages/engine/src/kernel/probe-result.ts` — type definitions

**Modify** (remove catch blocks, use `ProbeResult`):
- `packages/engine/src/kernel/legal-choices.ts` — 6 catch blocks → result reads
- `packages/engine/src/kernel/choose-n-option-resolution.ts` — 4 catch blocks → result reads
- `packages/engine/src/kernel/pipeline-viability-policy.ts` — 2 catch blocks → result reads
- `packages/engine/src/kernel/action-pipeline-predicates.ts` — 2 catch blocks → result reads
- `packages/engine/src/kernel/move-decision-sequence.ts` — 1 catch block → result read
- `packages/engine/src/kernel/legal-moves.ts` — 1 catch block → result read (line 449)
- `packages/engine/src/kernel/index.ts` — re-export new types

**Potentially modify** (if probe functions are refactored to return `ProbeResult` internally):
- `packages/engine/src/kernel/missing-binding-policy.ts` — may stay as internal utility
- `packages/engine/src/kernel/effect-error.ts` — `isEffectErrorCode` stays, but stacking check moves into probe

**Delete** (after migration):
- `isChoiceDecisionOwnerMismatchDuringProbe` export from `legal-choices.ts`
- Its import in `choose-n-option-resolution.ts`

## Out of Scope

- Non-probe error handling (effect execution errors, runtime contract violations)
- Agent-level error recovery (`fallbackOnError` in policy agents)
- The `missing-binding-policy.ts` module itself — it serves purposes beyond probing
- Changing the `shouldDeferFreeOperationZoneFilterFailure` function (it has its own specific logic)
- Performance optimization of probe execution

## Acceptance Criteria

### Tests

1. **Type contract tests**: `ProbeResult` type is exported and usable. `ProbeOutcome` and `ProbeInconclusiveReason` cover all cases.
2. **Catch block elimination**: The 5 primary files (`legal-choices.ts`, `choose-n-option-resolution.ts`, `pipeline-viability-policy.ts`, `action-pipeline-predicates.ts`, `move-decision-sequence.ts`) have **zero** try/catch blocks that pattern-match on `isChoiceDecisionOwnerMismatchDuringProbe`, `shouldDeferMissingBinding`, or `isEffectErrorCode('STACKING_VIOLATION')` for probe error classification.
3. **Full test suite**: `pnpm -F @ludoforge/engine test` — all tests pass.
4. **Determinism canary**: `pnpm -F @ludoforge/engine test:determinism` — seeds produce identical outcomes.
5. **Typecheck**: `pnpm turbo typecheck` — no new errors.
6. **Lint**: `pnpm turbo lint` — no new errors.

### Invariants

1. Probe outcomes are the ONLY mechanism for communicating speculative evaluation results. No new try/catch blocks for probe error classification.
2. The `ProbeInconclusiveReason` enum is exhaustive — adding a new reason is a compile-time change, not a runtime discovery.
3. All existing behavior is preserved — the same moves that were legal/illegal/inconclusive before the refactor produce the same classification after.
4. No game-specific logic in the probe result contract (FOUNDATIONS §1).

## Test Plan

### New Tests
- `packages/engine/test/unit/kernel/probe-result.test.ts` — type guard tests, exhaustiveness checks

### Existing Tests (must all pass)
- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine test:determinism`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
