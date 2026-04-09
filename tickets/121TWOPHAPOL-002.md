# 121TWOPHAPOL-002: Add actionId filtering to preparePlayableMoves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/prepare-playable-moves
**Deps**: `specs/15-gamespec-agent-policy-ir.md`

## Problem

The two-phase pipeline (Spec 121) requires Phase 2 to complete templates only for the winning `actionId`. Currently `preparePlayableMoves` completes all templates unconditionally. Adding an `actionId` filter allows the caller to restrict completion to a subset of templates, enabling the Phase 2 optimization without changing the function's core logic.

## Assumption Reassessment (2026-04-09)

1. `preparePlayableMoves` exists at `packages/engine/src/agents/prepare-playable-moves.ts` with signature `(input, options?: PreparePlayableMovesOptions) => PreparedPlayableMoves` — confirmed.
2. `PreparePlayableMovesOptions` currently has `pendingTemplateCompletions` and `choose` fields — confirmed.
3. Legal moves carry an `actionId` field (type `ActionId`) — confirmed via `types-core.ts` grep.
4. `greedy-agent.ts` and `random-agent.ts` also import `preparePlayableMoves` — the additive option won't affect them (they won't pass the filter).

## Architecture Check

1. Adding an optional filter field is additive and backward-compatible. Callers that don't pass the filter get current behavior (all templates completed).
2. No game-specific logic — `actionId` is a generic kernel concept used by all games.
3. No backwards-compatibility shims — this is a new capability, not a migration.

## What to Change

### 1. Extend `PreparePlayableMovesOptions`

Add an optional `actionIdFilter` field:

```typescript
readonly actionIdFilter?: string;
```

When provided, `preparePlayableMoves` skips template completion for moves whose `actionId` does not match the filter. Moves that are skipped are excluded from `completedMoves` and `stochasticMoves` but may still appear in statistics as "filtered."

### 2. Apply filter in template iteration

In the main loop that iterates over `input.legalMoves`, add an early-continue check:

```typescript
if (options.actionIdFilter !== undefined && move.actionId !== options.actionIdFilter) {
  continue;
}
```

This goes before the completion attempt, so no wasted work is done for non-matching templates.

### 3. Per-actionId completion statistics

Extend the returned `statistics` object (or `PolicyCompletionStatistics`) to include a breakdown by `actionId`:

```typescript
readonly completionsByActionId?: Readonly<Record<string, number>>;
```

This records how many templates were completed per `actionId`, supporting diagnostic output in the trace.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)

## Out of Scope

- Using the filter in `PolicyAgent.chooseMove` (ticket 003)
- Changes to `policy-eval.ts` or `policy-agent.ts`
- Trace output changes (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. When `actionIdFilter` is not provided, behavior is identical to current (all templates completed).
2. When `actionIdFilter` is provided, only templates with matching `actionId` are completed; non-matching templates are excluded from `completedMoves`.
3. `completionsByActionId` correctly counts completions per `actionId`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `PreparePlayableMovesOptions` remains a readonly interface.
2. The function's return type (`PreparedPlayableMoves`) is backward-compatible — new fields are optional.
3. Callers not passing `actionIdFilter` observe zero behavioral change.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves.test.ts` — add cases for:
   - Filter matches one actionId: only that actionId's templates are completed
   - Filter matches no actionId: empty completedMoves returned
   - No filter: all templates completed (regression guard)
   - `completionsByActionId` counts are accurate

### Commands

1. `node --test packages/engine/dist/test/unit/agents/prepare-playable-moves.test.js`
2. `pnpm -F @ludoforge/engine test`
