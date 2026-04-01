# 105EXPPRECON-004: Add mode to trace types and stochastic breakdown count

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — types-core (trace types), policy-preview (trace recording)
**Deps**: `tickets/105EXPPRECON-003.md`, `specs/105-explicit-preview-contracts.md`

## Problem

Preview traces record outcome types (`ready`, `stochastic`, `random`, etc.) but not which preview mode was in effect. This makes post-hoc analysis impossible — you cannot distinguish "profile uses `tolerateStochastic` and 40% were stochastic" from "profile uses `exactWorld` and 60% returned unknown." Additionally, `PolicyPreviewOutcomeBreakdownTrace` lacks a `stochastic` count, so accepted-but-divergent previews are invisible in breakdown stats.

## Assumption Reassessment (2026-04-01)

1. `PolicyPreviewUsageTrace` at `types-core.ts:1532` has fields: `evaluatedCandidateCount`, `refIds`, `unknownRefs`, `outcomeBreakdown` — no `mode` field. Confirmed.
2. `PolicyPreviewOutcomeBreakdownTrace` at `types-core.ts:1539` has: `ready`, `unknownRandom`, `unknownHidden`, `unknownUnresolved`, `unknownFailed` — no `stochastic` count. Confirmed.
3. `PolicyCandidateDecisionTrace` at line 1517 has `previewOutcome?: 'ready' | 'stochastic' | ...` — per-candidate outcome already recorded. Confirmed.
4. Trace recording happens in `policy-preview.ts` via `toPreviewTraceOutcome()` at line 284. Confirmed.

## Architecture Check

1. Adding `mode` to `PolicyPreviewUsageTrace` is a trace extension — purely additive, no behavioral change.
2. Adding `stochastic` to the breakdown trace captures information already available per-candidate but not aggregated.
3. Foundation 9 (Replay and Auditability) requires structured event records sufficient for analysis — the mode field directly supports this.

## What to Change

### 1. Add `mode` field to `PolicyPreviewUsageTrace` in `types-core.ts`

```typescript
export interface PolicyPreviewUsageTrace {
  readonly mode: AgentPreviewMode;                  // NEW
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRefTrace[];
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdownTrace;
}
```

### 2. Add `stochastic` count to `PolicyPreviewOutcomeBreakdownTrace`

```typescript
export interface PolicyPreviewOutcomeBreakdownTrace {
  readonly ready: number;
  readonly stochastic: number;         // NEW
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}
```

### 3. Update trace recording in preview pipeline

Where `PolicyPreviewUsageTrace` is constructed (in `policy-preview.ts` or `policy-runtime.ts`), include `mode` from the active profile's preview config. Where the breakdown is computed, count `stochastic` outcomes.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — trace type additions)
- `packages/engine/src/agents/policy-preview.ts` (modify — trace recording)

## Out of Scope

- Changing per-candidate `previewOutcome` taxonomy (stays as-is)
- Adding mode to per-candidate traces (the mode is profile-level, not per-candidate)
- Analytics or visualization consuming the new fields

## Acceptance Criteria

### Tests That Must Pass

1. Trace entries include `mode` field matching the profile's preview mode
2. Breakdown trace includes `stochastic` count that matches per-candidate stochastic outcomes
3. `disabled` mode traces show `mode: 'disabled'` with zero evaluated candidates
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Trace `mode` matches the compiled profile's `preview.mode` — never computed or inferred at runtime
2. `stochastic` + `ready` + `unknownRandom` + `unknownHidden` + `unknownUnresolved` + `unknownFailed` = total evaluated candidates
3. Traces remain deterministic (Foundation 8) — same inputs produce identical traces

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — add trace assertions for `mode` field and `stochastic` count
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — if trace shape golden tests exist, update them

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js`
2. `pnpm turbo build && pnpm turbo test`
