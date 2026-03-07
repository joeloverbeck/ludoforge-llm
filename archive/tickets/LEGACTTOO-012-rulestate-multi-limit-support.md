# LEGACTTOO-012: RuleState Multi-Limit Support

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — modify `tooltip-rule-card.ts`, `condition-annotator.ts`
**Deps**: archive/tickets/LEGACTTOO-008-engine-integration-describe-action-rulecard-caching.md

## Problem

`RuleState.limitUsage` is typed as a single `{ used: number; max: number }` scalar, but `ActionDef.limits` is `readonly LimitDef[]` — an action can have multiple limits with different scopes (e.g., 1/turn AND 3/game). `buildRuleState` in `condition-annotator.ts` silently drops all limits except the first:

```typescript
const limitSummary = limitUsage.length > 0
  ? { used: limitUsage[0]!.current, max: limitUsage[0]!.max }
  : undefined;
```

This means the runner tooltip cannot display per-scope usage for multi-limit actions.

## Assumption Reassessment (2026-03-07)

1. `ActionDef.limits` is `readonly LimitDef[]` at `types-core.ts:165` — confirmed array.
2. `LimitDef` has `scope: 'turn' | 'phase' | 'game'` and `max: number` — each limit has a distinct scope.
3. `annotateLimitsGroup` already computes per-limit `LimitUsageInfo[]` (condition-annotator.ts:201-204) — the data exists, it's just not surfaced to `RuleState`.
4. `RuleState.limitUsage` is `{ used: number; max: number }` — a single scalar. This was the original spec design (LEGACTTOO-004/005) but is insufficient for multi-limit actions.
5. Current tests that directly assert `RuleState.limitUsage` shape are in `tooltip-rule-card.test.ts`; `tooltip-pipeline-integration.test.ts` currently validates core payload invariants but does not assert the limit usage shape.

## Architecture Check

1. Changing `RuleState.limitUsage` from a single object to an array properly represents the domain model. No information loss.
2. The change is game-agnostic — `LimitDef` scopes are generic engine concepts, not game-specific.
3. No backwards-compatibility needed — LEGACTTOO-009 (runner UI) has not been implemented yet, so changing the type now has zero downstream impact.

## What to Change

### 1. Update `RuleState.limitUsage` type in `tooltip-rule-card.ts`

```typescript
// Before
readonly limitUsage?: { readonly used: number; readonly max: number };

// After
readonly limitUsage?: readonly { readonly scope: 'turn' | 'phase' | 'game'; readonly used: number; readonly max: number }[];
```

### 2. Update `buildRuleState` in `condition-annotator.ts`

Replace the single-limit summary with the full array:

```typescript
const limitSummary = limitUsage.length > 0
  ? limitUsage.map((l) => ({ scope: l.scope, used: l.current, max: l.max }))
  : undefined;
```

### 3. Update tests

Update unit tests that assert `RuleState` typing/shape and add a focused unit regression for multi-limit `RuleState.limitUsage` content.

## Files to Touch

- `packages/engine/src/kernel/tooltip-rule-card.ts` (modify — change `limitUsage` type)
- `packages/engine/src/kernel/condition-annotator.ts` (modify — update `buildRuleState`)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — update assertions)
- `packages/engine/test/unit/kernel/tooltip-rule-card.test.ts` (modify — update `RuleState.limitUsage` type assertions)

## Out of Scope

- Runner UI consumption of multi-limit data (LEGACTTOO-009)
- Adding new limit scopes beyond turn/phase/game

## Acceptance Criteria

### Tests That Must Pass

1. `RuleState.limitUsage` contains all limits with scope, used, and max for a multi-limit action.
2. `RuleState.limitUsage` is `undefined` for actions with no limits.
3. Single-limit actions produce a one-element array (not a scalar).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `RuleState.limitUsage` array length always equals `ActionDef.limits.length` when present.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — add/update assertions to verify `ruleState.limitUsage` is an array with full per-scope entries.
2. `packages/engine/test/unit/kernel/tooltip-rule-card.test.ts` — update the `RuleState` construction test to array form with scope.
3. Add test for action with multiple limits (turn + game) producing correct per-scope usage.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
2. `pnpm -F @ludoforge/engine test && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - `RuleState.limitUsage` now uses a multi-entry array shape with `scope`, `used`, and `max`.
  - `buildRuleState` now maps all computed limit usages instead of truncating to the first limit.
  - Unit tests now cover array-shaped `RuleState.limitUsage` and multi-limit rule-state propagation.
- Deviations from original plan:
  - Did not modify `tooltip-pipeline-integration.test.ts` because it does not directly assert `ruleState.limitUsage` shape; targeted unit coverage was sufficient and lower-noise.
- Verification results:
  - Passed: `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
  - Passed: `pnpm -F @ludoforge/engine test`
  - Passed: `pnpm -F @ludoforge/engine lint`
  - Passed: `pnpm turbo typecheck`
