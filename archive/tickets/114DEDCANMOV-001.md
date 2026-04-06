# 114DEDCANMOV-001: Add stableMoveKey dedup to preparePlayableMoves

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents (prepare-playable-moves), kernel types and schemas
**Deps**: None

## Problem

`preparePlayableMoves()` produces duplicate candidates with identical `stableMoveKey` values. In FITL VC decision points, 31 candidates appear from 15 unique classified moves — nearly half are duplicates. Duplicates cause preview evaluation waste, normalized scoring distortion, tiebreaker pollution, and unnecessary computation.

## Assumption Reassessment (2026-04-05)

1. `preparePlayableMoves()` exists at `packages/engine/src/agents/prepare-playable-moves.ts` line 66 — confirmed.
2. `stableMoveKey` is computed at line 85 via `toMoveIdentityKey(input.def, move)` — confirmed.
3. `PolicyCompletionStatistics` at `packages/engine/src/kernel/types-core.ts` line 1588 has 7 fields, no `duplicatesRemoved` — confirmed, field must be added.
4. `PolicyMovePreparationTrace` at `types-core.ts` line 1539 has no `skippedAsDuplicate` field — confirmed, field must be added.
5. Schemas at `packages/engine/src/kernel/schemas-core.ts` lines 1484-1495 (`PolicyCompletionStatisticsSchema`) and the `PolicyMovePreparationTraceSchema` use `.strict()` — confirmed, both must be updated.
6. 3 callers: `policy-agent.ts`, `greedy-agent.ts`, `random-agent.ts` — all consume the return value but do not need changes (the interface is additive).

## Architecture Check

1. Dedup is generic — operates on `stableMoveKey` strings with no game-specific logic. Any game with template-completed moves benefits automatically (Foundation 1).
2. In-loop early-exit is the cleanest insertion point — avoids all downstream processing for duplicates. No new modules, no new abstractions, just a `Set<string>` guard.
3. No backwards-compatibility shims. `duplicatesRemoved` is a required field (value 0 when none), and `skippedAsDuplicate` is optional on the trace type. All existing traces/fixtures must be updated in this change (Foundation 14).

## What to Change

### 1. Add `duplicatesRemoved` to `PolicyCompletionStatistics`

In `packages/engine/src/kernel/types-core.ts`, add `readonly duplicatesRemoved: number` to `PolicyCompletionStatistics`.

In `packages/engine/src/kernel/schemas-core.ts`, add `duplicatesRemoved: NumberSchema` to `PolicyCompletionStatisticsSchema`.

### 2. Add `skippedAsDuplicate` to `PolicyMovePreparationTrace`

In `packages/engine/src/kernel/types-core.ts`, add `readonly skippedAsDuplicate?: boolean` to `PolicyMovePreparationTrace`.

In `packages/engine/src/kernel/schemas-core.ts`, add `skippedAsDuplicate: z.boolean().optional()` to the `PolicyMovePreparationTraceSchema`.

### 3. Implement in-loop dedup in `preparePlayableMoves()`

In `packages/engine/src/agents/prepare-playable-moves.ts`:

- Declare `const seenMoveKeys = new Set<string>()` and `let duplicatesRemoved = 0` before the loop.
- After `stableMoveKey` computation (line 85), add early-exit: if `seenMoveKeys.has(stableMoveKey)`, increment `duplicatesRemoved`, push a minimal `movePreparations` entry with `skippedAsDuplicate: true`, and `continue`.
- Otherwise, `seenMoveKeys.add(stableMoveKey)`.
- Include `duplicatesRemoved` in the returned `statistics` object.

### 4. Update existing golden traces and fixtures

Grep for any golden trace files or test fixtures that contain `PolicyCompletionStatistics` objects. Add `duplicatesRemoved: 0` (or the correct value) to each.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- Golden trace/fixture files containing `PolicyCompletionStatistics` (modify — grep to identify)

## Out of Scope

- Template completion system — not changed
- Preview caching — not changed
- Scoring or normalization logic — not changed
- How `stableMoveKey` is computed — not changed

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds with no type errors
2. `pnpm -F @ludoforge/engine test` — all existing tests pass (golden traces updated)
3. `pnpm turbo typecheck` — no type errors across the workspace

### Invariants

1. `PolicyCompletionStatistics` always includes `duplicatesRemoved` (required, never undefined)
2. Deduplication is deterministic — same `legalMoves` order produces identical dedup results (Foundation 8)
3. No game-specific logic introduced — dedup operates on generic `stableMoveKey` strings (Foundation 1)
4. Previous state is never mutated — `Set` is a local variable, output arrays are new (Foundation 11)

## Test Plan

### New/Modified Tests

1. Golden trace fixtures — update to include `duplicatesRemoved` field (identified by grepping)

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completed: 2026-04-06
- Changed:
  - Added `duplicatesRemoved` to `PolicyCompletionStatistics`
  - Added optional `skippedAsDuplicate` to `PolicyMovePreparationTrace`
  - Deduplicated `preparePlayableMoves()` candidates by `stableMoveKey` with deterministic first-occurrence preservation
  - Updated schema/test fixtures and regenerated `packages/engine/schemas/Trace.schema.json`
  - Added a unit regression test proving duplicate-key removal and duplicate trace marking
- Deviations from original plan:
  - No separate golden trace file updates were needed beyond the touched schema/test fixture surfaces
  - The ticket's cited FITL duplicate incidence was not independently re-measured in this turn; the implementation verified the live mechanism and added regression coverage instead
- Verification:
  - `pnpm run check:ticket-deps`
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
