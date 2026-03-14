# 62BINCCHOPRO-006: Runner store — replace `chooseN` with incremental actions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: tickets/62BINCCHOPRO-005.md, archive/tickets/62BINCCHOPRO-001.md

## Problem

The runner store currently has a single `chooseN(selectedValues)` action that submits a completed array atomically. To use the incremental `advanceChooseN` protocol, the store needs three new actions (`addChooseNItem`, `removeChooseNItem`, `confirmChooseN`) that each call the worker bridge, receive the updated `ChoicePendingRequest`, and update the store's pending choice state.

## Assumption Reassessment (2026-03-14)

1. The game store is in `packages/runner/src/store/game-store.ts`. It uses Zustand. Confirmed.
2. The store has `choicePending: ChoicePendingRequest | null` and `chooseN(choice: readonly [...][])` action. Confirmed.
3. The store also has `chooseOne(choice)` and `confirmMove()`. These are unaffected. Confirmed.
4. `choicePending` is updated by the store after calling `legalChoices` on the worker. The new protocol replaces what happens between receiving a `chooseN` pending request and finalizing it. Confirmed.

## Architecture Check

1. The store stops owning authoritative `chooseN` selection state. `pending.selected` from the engine becomes the source of truth.
2. `addChooseNItem` / `removeChooseNItem` call `worker.advanceChooseN(...)` with the appropriate command, receive updated `ChoicePendingRequest`, and set `choicePending` to the new value.
3. `confirmChooseN` calls `worker.advanceChooseN(...)` with `{ type: 'confirm' }`. On `{ done: true }`, it writes the finalized array into the move and proceeds with the decision sequence (same as `chooseN` did before).
4. The old `chooseN(fullArray)` action can be preserved as an internal helper or deprecated, depending on whether any non-UI codepath still needs it. The AI path goes through `resolveMoveDecisionSequence` on the worker directly, not through the store.

## What to Change

### 1. Add `addChooseNItem` store action

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'add', value })`. On success (`done: false`), updates `choicePending` with the returned pending request. On error, surfaces the error to the UI.

### 2. Add `removeChooseNItem` store action

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'remove', value })`. On success, updates `choicePending`.

### 3. Add `confirmChooseN` store action

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'confirm' })`. On `{ done: true, value }`, writes the finalized array into `Move.params[decisionKey]` and advances the decision sequence. On `{ done: false }` (confirmation rejected), updates `choicePending` with the rejection reason.

### 4. Deprecate or remove old `chooseN` action

The old `chooseN(fullArray)` store action is no longer the primary path for UI-driven selection. It may be removed or kept as a fallback — decide based on whether any runner codepath still needs one-shot submission.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify — add three new actions, deprecate/remove old `chooseN`)
- `packages/runner/test/store/game-store.test.ts` (modify — add tests for new actions)

## Out of Scope

- Worker/bridge implementation (ticket 62BINCCHOPRO-005)
- ChoicePanel UI changes (ticket 62BINCCHOPRO-007)
- Engine kernel changes (tickets 62BINCCHOPRO-001 through -004)
- `chooseOne` action — unchanged
- `confirmMove` action — unchanged (it handles the final move application after all decisions are resolved)
- AI agent flow — agents use `resolveMoveDecisionSequence` on the worker, not the store

## Acceptance Criteria

### Tests That Must Pass

1. `addChooseNItem`: calls worker bridge with correct command, updates `choicePending` with returned pending request
2. `addChooseNItem`: surfaces error when worker rejects the addition (illegal item, duplicate)
3. `removeChooseNItem`: calls worker bridge, updates `choicePending`
4. `removeChooseNItem`: surfaces error for items not in `currentSelected`
5. `confirmChooseN`: on `{ done: true }`, writes finalized array to move params and advances decision sequence
6. `confirmChooseN`: on rejection (below min), updates `choicePending` without advancing
7. `chooseOne` action is completely unaffected
8. `pnpm -F @ludoforge/runner typecheck` succeeds
9. `pnpm -F @ludoforge/runner test` — no regressions

### Invariants

1. `choicePending.selected` is always the engine-returned value — the store never locally mutates selection state
2. `choicePending.canConfirm` is always the engine-returned value — the store never locally computes it
3. `chooseOne` flow is completely unchanged
4. No game-specific identifiers in store code

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — all acceptance criteria scenarios

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
