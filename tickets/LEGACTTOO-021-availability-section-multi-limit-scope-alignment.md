# LEGACTTOO-021: AvailabilitySection Multi-Limit Scope Alignment

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/LEGACTTOO-012-rulestate-multi-limit-support.md

## Problem

`AvailabilitySection.tsx` consumes `RuleState.limitUsage` as a single scalar `{ used: number; max: number }` and hardcodes the display text to `"remaining this turn"`. On main, LEGACTTOO-012 changed `RuleState.limitUsage` to `readonly { scope: 'turn' | 'phase' | 'game'; used: number; max: number }[]` — an array with per-limit scope. Once the worktree merges with main:

1. **Type error**: `AvailabilitySection` destructures `limitUsage` as a scalar, but it is now an array.
2. **Wrong scope label**: The hardcoded `"this turn"` text is incorrect for `phase` and `game` scoped limits.
3. **Data loss**: Only a single limit is rendered, but actions can have multiple limits (e.g., 1/turn AND 3/game).

## Assumption Reassessment (2026-03-07)

1. `RuleState.limitUsage` on main is `readonly { scope: 'turn' | 'phase' | 'game'; used: number; max: number }[]` after LEGACTTOO-012. **Confirmed via `git show f1b8ac52:packages/engine/src/kernel/tooltip-rule-card.ts`.**
2. `AvailabilitySection.tsx` in the worktree at line 25 reads `limitUsage.max - limitUsage.used` as scalar properties. **Confirmed in worktree source.**
3. Hardcoded `"remaining this turn"` at line 26. **Confirmed in worktree source.**
4. No other ticket covers the runner-side consumption of multi-limit data. LEGACTTOO-012 was engine-only.

## Architecture Check

1. The runner must consume the engine type contract faithfully — rendering all limits with correct scope labels keeps the UI truthful and the type boundary clean.
2. No game-specific logic: scope labels (`turn`, `phase`, `game`) are generic engine concepts. The display mapping is a simple `scope → label` lookup.
3. No backwards-compatibility shim — the old scalar shape no longer exists on main.

## What to Change

### 1. Update `AvailabilitySection` to consume `limitUsage` as an array

Iterate over the array and render one status line per limit entry. Replace the hardcoded `"this turn"` with a scope-derived label:

```typescript
const scopeLabel = (scope: 'turn' | 'phase' | 'game'): string => {
  switch (scope) {
    case 'turn': return 'this turn';
    case 'phase': return 'this phase';
    case 'game': return 'total';
  }
};
```

### 2. Update `AvailabilitySection.test.ts` assertions

Provide `limitUsage` as an array with scope in all test fixtures. Add a test for multi-limit display (e.g., turn + game scoped limits rendering two lines).

## Files to Touch

- `packages/runner/src/ui/AvailabilitySection.tsx` (modify)
- `packages/runner/test/ui/AvailabilitySection.test.ts` (modify)

## Out of Scope

- Engine-side multi-limit changes (already landed in LEGACTTOO-012)
- Verbalization-driven scope labels (future polish — current scope strings are adequate)
- Accessibility improvements for collapsible sections (separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. Single-limit action renders `"(N remaining this turn)"` for turn-scoped limits.
2. Phase-scoped limit renders `"(N remaining this phase)"`.
3. Game-scoped limit renders `"(N remaining total)"`.
4. Multi-limit action (turn + game) renders one line per limit.
5. No-limit action renders no limit text.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `AvailabilitySection` types align with `RuleState.limitUsage` from `@ludoforge/engine/runtime`.
2. No game-specific scope logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/AvailabilitySection.test.ts` — update existing limit fixture to array shape; add multi-limit and per-scope label assertions.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
