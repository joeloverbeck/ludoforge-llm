# 121TWOPHAPOL-002: Add actionId filtering to preparePlayableMoves

**Status**: COMPLETED
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
5. The original ticket's proposed `readonly actionIdFilter?: string` is stale against Foundation 17 — the live boundary should use branded `ActionId`.
6. `PolicyCompletionStatistics` is a shared kernel contract with a matching schema in `packages/engine/src/kernel/schemas-core.ts`, so adding `completionsByActionId` requires synchronized type/schema/artifact updates.
7. The original test path was stale. The live unit test surface is `packages/engine/test/unit/prepare-playable-moves.test.ts`.

## Architecture Check

1. Adding an optional filter field is additive and backward-compatible. Callers that don't pass the filter get current behavior (all templates completed).
2. No game-specific logic — `actionId` is a generic kernel concept used by all games.
3. Foundation 17 requires the filter surface to use branded `ActionId`, not raw strings in implementation code.
4. `completionsByActionId` widens a shared diagnostics contract, so Foundations 14 and 15 require synchronized type/schema/artifact updates rather than a local-only module patch.
5. No backwards-compatibility shims — this is a new capability, not a migration.

## What to Change

### 1. Extend `PreparePlayableMovesOptions`

Add an optional `actionIdFilter` field:

```typescript
readonly actionIdFilter?: ActionId;
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

Extend the shared `PolicyCompletionStatistics` contract to include a breakdown by `actionId`:

```typescript
readonly completionsByActionId?: Readonly<Record<string, number>>;
```

This records how many templates were completed per `actionId`, supporting diagnostic output in the trace.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (regenerate if needed)
- `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify)

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

1. `packages/engine/test/unit/prepare-playable-moves.test.ts` — add cases for:
   - Filter matches one actionId: only that actionId's templates are completed
   - Filter matches no actionId: empty completedMoves returned
   - No filter: all templates completed (regression guard)
   - `completionsByActionId` counts are accurate

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/prepare-playable-moves.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-09
- Changed:
  - Added optional `actionIdFilter` to `PreparePlayableMovesOptions` in `packages/engine/src/agents/prepare-playable-moves.ts`, using the branded `Move['actionId']` surface rather than a raw string.
  - Filtered `preparePlayableMoves` before template completion so callers can restrict completion work to a single `actionId`.
  - Added optional `completionsByActionId` to the shared `PolicyCompletionStatistics` contract in `packages/engine/src/kernel/types-core.ts` and its matching schema in `packages/engine/src/kernel/schemas-core.ts`.
  - Regenerated `packages/engine/schemas/Trace.schema.json` to keep the serialized trace contract synchronized.
  - Updated `packages/engine/test/unit/prepare-playable-moves.test.ts` and nearby exact-shape assertions in policy/trace/schema tests to cover the new statistics field and filtering behavior.
- Deviations from original plan:
  - The original ticket boundary was too narrow. Foundations-compliant completion required widening beyond `prepare-playable-moves.ts` to the shared stats contract, schema layer, regenerated artifact, and the live test path.
  - The original ticket’s raw-string `actionIdFilter` proposal was corrected to a branded implementation boundary.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/prepare-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
