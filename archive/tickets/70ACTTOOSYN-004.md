# 70ACTTOOSYN-004: Prefer SummaryMessage as synopsis source in tooltip-content-planner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip-content-planner
**Deps**: archive/tickets/70ACTTOOSYN-003.md

## Problem

`SummaryMessage` is already a first-class tooltip IR node, and the normalizer already emits it for macro-driven summaries. But `findSynopsisSource` in `packages/engine/src/kernel/tooltip-content-planner.ts` still only matches `select` and `choose`, so planner-derived synopses can ignore an existing summary message and fall back to generated selection text.

This is now a narrow planner-priority defect, not a broader tooltip-pipeline feature gap.

## Assumption Reassessment (2026-03-21)

1. `findSynopsisSource` in `packages/engine/src/kernel/tooltip-content-planner.ts` still matches only `select` and `choose` — confirmed.
2. `realizeMessage` in `packages/engine/src/kernel/tooltip-template-realizer.ts` already handles `summary` kind via `realizeSummary()` — confirmed. No realizer change is needed.
3. `actionSummaries` already exists in schema/compiler/runtime plumbing:
   - `packages/engine/src/cnl/game-spec-doc.ts`
   - `packages/engine/src/cnl/compile-verbalization.ts`
   - `packages/engine/src/kernel/verbalization-types.ts`
   - `packages/engine/src/kernel/condition-annotator.ts`
4. Existing tests already cover action-level authored synopses through `condition-annotator` and integration coverage.
5. The missing coverage is specifically planner behavior when a `SummaryMessage` is present in `TooltipMessage[]` and no higher-priority `authoredSynopsis` has been injected.

## Architecture Check

1. The current architecture is sound if priorities are explicit:
   - `condition-annotator` owns action-level authored synopsis injection (`authoredSynopsis`).
   - `tooltip-content-planner` owns message-level synopsis selection.
   - `tooltip-template-realizer` should continue realizing all message kinds through the same dispatcher.
2. The robust fix is therefore to change planner priority only:
   - prefer `summary`
   - fall back to `select` / `choose`
3. Adding a `summary` special-case in `realizeSynopsis` would duplicate logic that already exists in `realizeMessage` and would make the realizer less coherent, not more.
4. No backward compatibility layer is needed. Actions without `SummaryMessage` must continue to use the existing `select` / `choose` fallback.

## What to Change

### 1. Update `findSynopsisSource` to prefer `summary`

**File**: `packages/engine/src/kernel/tooltip-content-planner.ts`

Change:
```typescript
function findSynopsisSource(messages: readonly TooltipMessage[]): TooltipMessage | undefined {
  return messages.find((m) => m.kind === 'select' || m.kind === 'choose');
}
```

To:
```typescript
function findSynopsisSource(messages: readonly TooltipMessage[]): TooltipMessage | undefined {
  const summary = messages.find((m) => m.kind === 'summary');
  if (summary !== undefined) return summary;
  return messages.find((m) => m.kind === 'select' || m.kind === 'choose');
}
```

## Files to Touch

- `packages/engine/src/kernel/tooltip-content-planner.ts` (modify)
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` (modify)

## Out of Scope

- Any `actionSummaries` schema/compiler/runtime work already implemented elsewhere
- Any `tooltip-template-realizer.ts` changes
- Changing the tooltip normalizer
- Changing game data files
- Changing the ActionTooltip React component
- Refactoring the tooltip architecture beyond synopsis-source priority

## Acceptance Criteria

### Tests That Must Pass

1. `planContent([summaryMsg, selectMsg], ...)` chooses `summaryMsg` as `synopsisSource`.
2. `planContent([selectMsg, chooseMsg], ...)` still chooses `selectMsg`.
3. `planContent([summaryMsg], ...)` chooses `summaryMsg`.
4. `planContent([], ...)` leaves `synopsisSource` undefined.
5. `planContent([placeMsg, moveMsg], ...)` leaves `synopsisSource` undefined.
6. Existing `condition-annotator` authored-synopsis tests continue to pass unchanged.
7. Existing engine tooltip suites continue to pass.

### Invariants

1. `findSynopsisSource` remains a pure function with the same signature.
2. `realizeSynopsis` and `realizeMessage` remain unchanged.
3. Action-level authored synopsis precedence remains unchanged.
4. Actions without summary messages behave exactly as before.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — add synopsis-source priority coverage for `SummaryMessage`.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the live codebase and reduced scope to the only remaining defect.
  - Added planner tests proving that `SummaryMessage` must win synopsis selection over `select` / `choose`.
  - Updated `findSynopsisSource()` in `packages/engine/src/kernel/tooltip-content-planner.ts` to prefer `summary` before falling back to `select` / `choose`.
- Deviations from original plan:
  - No `tooltip-template-realizer.ts` change was made because `summary` realization was already implemented correctly.
  - No `actionSummaries`, compiler, normalizer, or game-data work was needed because those parts had already landed.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/kernel/tooltip-content-planner.test.ts`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/kernel/condition-annotator.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
