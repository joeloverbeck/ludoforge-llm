# PIPEVAL-004: Validate pipeline accompanyingOps against declared actions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None

## Problem

`ActionPipelineDef.accompanyingOps` can be `'any'` or a `readonly string[]` of action IDs. When it's a string array, entries should reference valid action IDs declared in `def.actions`. Currently these are never validated — a typo would silently compile and the accompanying-ops dispatch logic would never match, causing subtle behavioral bugs.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.accompanyingOps` is typed as `'any' | readonly string[]` at `types-operations.ts:27` — confirmed.
2. `actionCandidates` is already passed to `validateActionPipelines` — confirmed. No new parameters needed.
3. No existing validation for `accompanyingOps` — confirmed by grep.
4. FITL uses `accompanyingOps` in several pipelines — confirmed by grep of `30-rules-actions.md`.

## Architecture Check

1. Follows the established `actionId` validation pattern already in `validateActionPipelines` — same `pushMissingReferenceDiagnostic` with `actionCandidates`.
2. Game-agnostic: `accompanyingOps` is a generic engine concept.
3. No backwards-compatibility concern — purely additive diagnostics.

## What to Change

### 1. Validate `accompanyingOps` entries when array

Inside the `actionPipeline` forEach loop, add:
```typescript
if (Array.isArray(actionPipeline.accompanyingOps)) {
  actionPipeline.accompanyingOps.forEach((opId, opIndex) => {
    if (!actionCandidates.includes(opId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_ACTION_MISSING',
        `${basePath}.accompanyingOps[${opIndex}]`,
        `Unknown action "${opId}" in accompanyingOps.`,
        opId,
        actionCandidates,
      );
    }
  });
}
```

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify — add tests)

## Out of Scope

- Semantic validation of `accompanyingOps` against the option matrix
- Validating that `accompanyingOps: 'any'` is appropriate for the pipeline's role

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline with `accompanyingOps: 'any'` — no diagnostic
2. Pipeline with `accompanyingOps: ['playCard']` referencing a declared action — no diagnostic
3. Pipeline with `accompanyingOps: ['nonexistent']` — produces `REF_ACTION_MISSING`
4. Pipeline without `accompanyingOps` — no diagnostic
5. FITL production spec compiles with zero new diagnostics
6. Existing suite: `pnpm turbo test --force`

### Invariants

1. Reuses existing `REF_ACTION_MISSING` diagnostic code — consistent with `actionId` validation
2. No game-specific branching in kernel validation

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — 3 new tests (any, valid array, invalid array)

### Commands

1. `pnpm turbo build && pnpm turbo test --force`
