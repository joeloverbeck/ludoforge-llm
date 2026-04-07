# 118PROBOUCAT-003: Migrate `pipeline-viability-policy.ts`, `action-pipeline-predicates.ts`, `move-decision-sequence.ts` to `probeWith`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel pipeline-viability-policy, action-pipeline-predicates, move-decision-sequence modules
**Deps**: `archive/tickets/118PROBOUCAT-001.md`

## Problem

Three files each have 1 catch block that follows the try-catch-classify pattern using `classifyMissingBindingProbeError`. Unlike the single-param classifiers in `legal-choices.ts`, `classifyMissingBindingProbeError` takes 2 parameters: `(error: unknown, context: MissingBindingPolicyContext)`. Each call site must curry the context parameter to match the `probeWith` classifier signature.

## Assumption Reassessment (2026-04-07)

1. `pipeline-viability-policy.ts` — catch block at line ~115 using `classifyMissingBindingProbeError` with `MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_VIABILITY_POLICY` — confirmed.
2. `action-pipeline-predicates.ts` — catch block at line ~23 using `classifyMissingBindingProbeError` with `MISSING_BINDING_POLICY_CONTEXTS.ACTION_PIPELINE_PREDICATES` — confirmed.
3. `move-decision-sequence.ts` — catch block at line ~68 using `classifyMissingBindingProbeError` with `MISSING_BINDING_POLICY_CONTEXTS.MOVE_DECISION_SEQUENCE` (or similar context) — confirmed.
4. `classifyMissingBindingProbeError` is exported from `missing-binding-policy.ts:66-82`, signature `(error: unknown, context: MissingBindingPolicyContext): ProbeResult<never> | null`.
5. **Blast radius**: `classifyMissingBindingProbeError` is also called at `legal-moves.ts:451` outside a catch block. This ticket does NOT touch that call site — it is not a catch block, and its calling convention is unaffected by the migration.

## Architecture Check

1. Mechanical replacement with closure wrapping — `probeWith(fn, (e) => classifyMissingBindingProbeError(e, ctx))`. Behavior is identical.
2. No game-specific logic introduced. The context constants are already game-agnostic policy identifiers.
3. No backwards-compatibility shims — the catch blocks are fully replaced.

## What to Change

### 1. `pipeline-viability-policy.ts`

Import `probeWith` from `./probe-result.js`. Replace the catch block at ~115 with:

```typescript
return probeWith(
  () => /* existing inner function call */,
  (e) => classifyMissingBindingProbeError(e, MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_VIABILITY_POLICY),
);
```

### 2. `action-pipeline-predicates.ts`

Import `probeWith` from `./probe-result.js`. Replace the catch block at ~23 with:

```typescript
return probeWith(
  () => /* existing inner function call */,
  (e) => classifyMissingBindingProbeError(e, MISSING_BINDING_POLICY_CONTEXTS.ACTION_PIPELINE_PREDICATES),
);
```

### 3. `move-decision-sequence.ts`

Import `probeWith` from `./probe-result.js`. Replace the catch block at ~68 with:

```typescript
return probeWith(
  () => /* existing inner function call */,
  (e) => classifyMissingBindingProbeError(e, /* existing context constant */),
);
```

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)

## Out of Scope

- Changing `classifyMissingBindingProbeError` signature or behavior
- The non-catch call site at `legal-moves.ts:451`
- `legal-choices.ts` migration (118PROBOUCAT-002)
- Group B, C, or D migration work

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests for pipeline-viability-policy, action-pipeline-predicates, and move-decision-sequence pass unchanged
2. `classifyMissingBindingProbeError` is still invoked with the correct context for each call site
3. FITL canary seeds produce identical results: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No behavioral change — same errors produce the same `ProbeResult` outcomes
2. Unclassified errors still propagate
3. No catch blocks remain for the 3 migrated sites
4. The non-catch consumer at `legal-moves.ts:451` is unaffected

## Test Plan

### New/Modified Tests

1. No new tests needed — existing tests cover the behavior.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test --force`
