# 70ACTTOOSYN-004: Update findSynopsisSource to prefer summary messages and realizeSynopsis to handle summary kind

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip-content-planner + tooltip-template-realizer
**Deps**: tickets/70ACTTOOSYN-003.md

## Problem

`findSynopsisSource` in `tooltip-content-planner.ts` only matches `select` and `choose` messages. Even after ticket 003 emits `SummaryMessage` from `actionSummaries`, the content planner ignores it — so the tooltip header continues showing the first `select`/`choose` step instead of the authored summary.

Additionally, `realizeSynopsis` in `tooltip-template-realizer.ts` passes all synopsis sources through `realizeMessage()`, which dispatches by `kind`. For `summary` kind, the text is already human-readable and should be used directly — it should not go through `realizeMessage` which may not have a handler for `summary` kind.

## Assumption Reassessment (2026-03-20)

1. `findSynopsisSource` is at `tooltip-content-planner.ts:139-143` — confirmed; matches only `select` or `choose`.
2. `realizeSynopsis` is at `tooltip-template-realizer.ts:358-368` — confirmed; unconditionally calls `realizeMessage(synopsisSource, ctx)`.
3. `realizeMessage` dispatches on `kind` with ~23 handlers — verify at implementation time whether `summary` kind is handled. If not, it would fall through or error.
4. `SummaryMessage` has shape `{ kind: 'summary', text: string, astPath: string }` — confirmed from `tooltip-ir.ts`.

## Architecture Check

1. Preferring `summary` over `select`/`choose` is a priority change, not a structural change. The function signature is unchanged.
2. `realizeSynopsis` special-casing `summary` kind to use `.text` directly is cleaner than adding a `summary` handler to `realizeMessage` — the text is already human-readable, not an AST that needs realization.
3. No backward incompatibility: actions without a `SummaryMessage` still fall through to `select`/`choose` as before.

## What to Change

### 1. Update `findSynopsisSource` to prefer summary

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

### 2. Update `realizeSynopsis` to handle summary kind

**File**: `packages/engine/src/kernel/tooltip-template-realizer.ts`

Change `realizeSynopsis` to check for `summary` kind before calling `realizeMessage`:

```typescript
const realizeSynopsis = (plan: ContentPlan, ctx: LabelContext): string => {
  const label = resolveLabel(plan.actionLabel, ctx);
  if (plan.synopsisSource !== undefined) {
    if (plan.synopsisSource.kind === 'summary') {
      return `${label} — ${plan.synopsisSource.text}`;
    }
    const detail = realizeMessage(plan.synopsisSource, ctx);
    return `${label} — ${detail}`;
  }
  return label;
};
```

## Files to Touch

- `packages/engine/src/kernel/tooltip-content-planner.ts` (modify)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify)
- `packages/engine/test/unit/tooltip-content-planner.test.ts` (modify or new — findSynopsisSource tests)
- `packages/engine/test/unit/tooltip-template-realizer.test.ts` (modify — realizeSynopsis tests)

## Out of Scope

- Changing the tooltip normalizer (70ACTTOOSYN-003)
- Changing `realizeMessage` dispatch table (summary kind is handled before it's called)
- Changing `planContent` beyond the `findSynopsisSource` call
- Changing game data files (70ACTTOOSYN-005, 70ACTTOOSYN-006)
- Changing the ActionTooltip React component
- Refactoring the content planning or template realization architecture

## Acceptance Criteria

### Tests That Must Pass

1. `findSynopsisSource([summaryMsg, selectMsg])` returns `summaryMsg` (summary preferred over select).
2. `findSynopsisSource([selectMsg, chooseMsg])` returns `selectMsg` (backward compat — select/choose still works).
3. `findSynopsisSource([summaryMsg])` returns `summaryMsg` (summary alone works).
4. `findSynopsisSource([])` returns `undefined` (empty array).
5. `findSynopsisSource([placeMsg, moveMsg])` returns `undefined` (no summary/select/choose).
6. `realizeSynopsis` with a `summary` synopsisSource produces `"Label — summary text"` without calling `realizeMessage`.
7. `realizeSynopsis` with a `select` synopsisSource still calls `realizeMessage` (backward compat).
8. `realizeSynopsis` with no synopsisSource returns just the label.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `findSynopsisSource` remains a pure function with the same signature.
2. `realizeSynopsis` remains a pure function with the same signature.
3. All existing tooltip tests (content planner + template realizer) pass unchanged.
4. Actions without authored summaries behave exactly as before — select/choose fallback is preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/tooltip-content-planner.test.ts` — add `findSynopsisSource` describe block with priority tests.
2. `packages/engine/test/unit/tooltip-template-realizer.test.ts` — add `realizeSynopsis` tests for summary kind vs select kind vs no synopsis.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "synopsis|Synopsis"`
2. `pnpm turbo typecheck && pnpm turbo test && pnpm turbo lint`
