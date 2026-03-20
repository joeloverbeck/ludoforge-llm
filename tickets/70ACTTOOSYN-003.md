# 70ACTTOOSYN-003: Emit SummaryMessage from actionSummaries in tooltip normalizer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip-normalizer
**Deps**: 70ACTTOOSYN-002 (actionSummaries must exist on VerbalizationDef)

## Problem

Even after `actionSummaries` is available on `VerbalizationDef` (ticket 002), the tooltip normalizer does not use it. When generating tooltip messages for an action, the normalizer must check `verbalization.actionSummaries?.[actionId]` and prepend a `SummaryMessage` if a summary exists. Without this, the content planner has no summary message to prefer over `select`/`choose` messages.

## Assumption Reassessment (2026-03-20)

1. `normalizeEffect` is the entry point at `tooltip-normalizer.ts:414-474` — confirmed.
2. `NormalizerContext` includes `verbalization: VerbalizationDef | undefined` — confirmed at lines 32-41.
3. `SummaryMessage` (kind: `'summary'`) already exists in `tooltip-ir.ts` — confirmed; it's used by `tryLeafMacroOverride`.
4. The normalizer does NOT currently have an `actionId` parameter — need to identify how action identity flows into the normalization pipeline. The entry point that calls `normalizeEffect` for a specific action must pass the action ID. This may require threading `actionId` through `NormalizerContext` or through the caller.

## Architecture Check

1. Emitting a `SummaryMessage` from `actionSummaries` is analogous to the existing `tryLeafMacroOverride` path which emits `SummaryMessage` from `verbalization.macros[macroId].summary`. This is a parallel lookup path, not a new mechanism.
2. The summary comes from per-game YAML data, not hardcoded text — engine-agnostic.
3. No mutation: the normalizer returns a new array with the summary prepended.

## What to Change

### 1. Thread actionId into the normalization pipeline

Identify the call site(s) where `normalizeEffect` is invoked for a specific action's effect tree. The action ID must be available so we can look up `verbalization.actionSummaries?.[actionId]`.

**Approach A** (preferred): Add `actionId?: string` to `NormalizerContext`. Set it at the top-level call site where an action's effects are normalized.

**Approach B**: Add the summary prepend at the caller level (above `normalizeEffect`), after collecting all messages for an action.

The implementer must read the call chain to determine which approach fits cleanly. The spec suggests approach B (prepend at the entry point that produces `TooltipMessage[]` for an action).

### 2. Prepend SummaryMessage when actionSummaries has a match

At the entry point that produces tooltip messages for an action:

```typescript
if (ctx.verbalization?.actionSummaries?.[actionId] !== undefined) {
  messages.unshift({
    kind: 'summary',
    text: ctx.verbalization.actionSummaries[actionId],
    astPath: `action:${actionId}`,
  });
}
```

This must run BEFORE macro-level summary detection so that action-level summaries take priority for non-macro actions. Macro-originated actions (profiles) already get summaries from the existing macro lookup path.

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify)
- Possibly the caller of `normalizeEffect` that handles per-action tooltip generation (modify — to thread actionId)
- `packages/engine/test/unit/tooltip-normalizer.test.ts` (modify — add actionSummaries tests)

## Out of Scope

- Changing `findSynopsisSource` or `realizeSynopsis` (70ACTTOOSYN-004)
- Adding YAML data to game files (70ACTTOOSYN-005, 70ACTTOOSYN-006)
- Changing the tooltip IR types (SummaryMessage already exists)
- Changing how macro-originated summaries work (tryLeafMacroOverride)
- Refactoring the normalizer's dispatch logic

## Acceptance Criteria

### Tests That Must Pass

1. When `verbalization.actionSummaries` has `{ rally: 'Place forces and build bases' }` and the action ID is `'rally'`, the returned messages array starts with a `SummaryMessage` whose `text` is `'Place forces and build bases'`.
2. When `verbalization.actionSummaries` is `undefined` or does not contain the action ID, no extra `SummaryMessage` is prepended — existing behavior unchanged.
3. When both `actionSummaries[actionId]` and a macro-originated summary exist, the `actionSummaries` summary appears first (it will be found first by `findSynopsisSource` in ticket 004).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `normalizeEffect` remains a pure function — no side effects, no mutation.
2. Existing macro-originated `SummaryMessage` emission (via `tryLeafMacroOverride`) is untouched.
3. The `SummaryMessage` shape matches the existing IR definition — `kind: 'summary'`, `text: string`, `astPath: string`.
4. All existing tooltip normalizer tests pass unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/tooltip-normalizer.test.ts` — add tests for `actionSummaries` lookup: match found (SummaryMessage prepended), no match (no change), undefined verbalization (no change).

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "normaliz"`
2. `pnpm turbo typecheck && pnpm turbo test && pnpm turbo lint`
