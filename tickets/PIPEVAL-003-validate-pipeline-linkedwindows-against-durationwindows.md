# PIPEVAL-003: Validate pipeline linkedWindows against durationWindows

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`
**Deps**: None

## Problem

`ActionPipelineDef.linkedWindows` contains duration window ID strings (e.g. `['turn', 'round']`) that reference `turnFlow.durationWindows`. Currently these are never validated — a typo like `'trun'` would silently compile and produce incorrect runtime behavior (the window linkage would be ignored). This is the same class of silent-reference gap that caused the `spaceId` bug.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.linkedWindows` is typed as `readonly string[]` at `types-operations.ts:35` — confirmed.
2. `turnFlow.durationWindows` is the canonical list of valid window IDs — confirmed at `types-core.ts` (cardDriven turnOrder config).
3. No existing validation for `linkedWindows` anywhere in the validator — confirmed by grep of `validate-gamedef-*.ts`.
4. FITL uses `linkedWindows` in several pipelines — confirmed by grep of `30-rules-actions.md`.

## Architecture Check

1. Follows the established pattern: `validateActionPipelines` already checks `actionId` against `actionCandidates`. Adding `linkedWindows` checks against `durationWindowCandidates` is the same pattern.
2. Game-agnostic: `linkedWindows` and `durationWindows` are generic engine concepts, not FITL-specific.
3. No backwards-compatibility concern — adding new diagnostics is purely additive.

## What to Change

### 1. Build `durationWindowCandidates` in `validateActionPipelines`

Extract `durationWindows` from `def.turnOrder.config.turnFlow.durationWindows` (when turnOrder is cardDriven) and build a `Set<string>` of valid window IDs. Pass to the validation loop or derive from the `def` parameter already available.

### 2. Validate each `linkedWindows` entry

Inside the `actionPipeline` forEach loop, add:
```typescript
(actionPipeline.linkedWindows ?? []).forEach((windowId, windowIndex) => {
  if (!durationWindowCandidates.has(windowId)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_DURATION_WINDOW_MISSING',
      `${basePath}.linkedWindows[${windowIndex}]`,
      `Unknown duration window "${windowId}".`,
      windowId,
      [...durationWindowCandidates],
    );
  }
});
```

### 3. Add diagnostic code

Register `REF_DURATION_WINDOW_MISSING` in the diagnostics system if needed (check if diagnostic codes are enum-constrained or string-based).

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify — add tests)

## Out of Scope

- Validating `durationWindows` declarations themselves (that's structural validation)
- Runtime behavior changes for unrecognized windows

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline with valid `linkedWindows` referencing declared `durationWindows` — no diagnostic
2. Pipeline with `linkedWindows: ['nonexistent']` — produces `REF_DURATION_WINDOW_MISSING`
3. Pipeline without `linkedWindows` — no diagnostic
4. FITL production spec compiles with zero `REF_DURATION_WINDOW_MISSING` diagnostics
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No game-specific branching in kernel validation
2. `linkedWindows` validation only active when `turnOrder.type === 'cardDriven'`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — 3 new tests (valid, invalid, absent)

### Commands

1. `pnpm turbo build && pnpm turbo test --force`
