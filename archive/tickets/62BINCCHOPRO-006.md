# 62BINCCHOPRO-006: Runner incremental `chooseN` adoption across store and choice UI

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — engine and worker support already exist; runner consumption is incomplete
**Deps**: archive/tickets/62BINCCHOPRO-005.md, archive/tickets/62BINCCHOPRO-001.md

## Problem

The engine runtime and runner worker already support incremental multi-selection through `advanceChooseN(...)`, with engine-owned `selected` and `canConfirm` state on pending `chooseN` requests. The runner still uses the old atomic `chooseN(selectedValues)` store action and a `ChoicePanel` implementation that tracks selected items in local React state. That leaves the authoritative incremental protocol unused in the runner, duplicates legality/bounds logic in the UI, and discards engine-owned pending state that should drive rendering.

## Assumption Reassessment (2026-03-14)

1. The game store is in `packages/runner/src/store/game-store.ts` and uses Zustand. Confirmed.
2. The store still exposes atomic `chooseN(choice: readonly [...])`, implemented via the same `submitChoice(...)` path as `chooseOne(...)`. Confirmed.
3. The runner worker API already exposes `advanceChooseN(...)`, and worker tests already cover that delegation. The ticket must not assume ticket `-005` is still pending implementation work. Confirmed.
4. The engine already returns `selected` and `canConfirm` on pending `chooseN` requests, and engine tests cover incremental legality recomputation. Confirmed.
5. The runner render model currently maps `chooseN` pending requests to `choiceUi.kind === 'discreteMany'` without carrying forward `selected` or `canConfirm`. Confirmed discrepancy.
6. `ChoicePanel` currently owns multi-select selection state locally with `useState`, recomputes confirm eligibility from bounds, and dispatches one atomic `chooseN(selectedValues)` call. Confirmed discrepancy.
7. `chooseOne(...)` and `confirmMove()` do not need protocol changes, but UI plumbing that currently calls `chooseN(...)` must be updated in the same ticket to avoid preserving the obsolete one-shot path. Confirmed.

## Architecture Check

1. The store and UI must stop owning authoritative `chooseN` selection state. `choicePending.selected` and `choicePending.canConfirm` from the engine become the source of truth everywhere in the runner.
2. `addChooseNItem` / `removeChooseNItem` call `worker.advanceChooseN(...)` with the appropriate command, receive updated `ChoicePendingRequest`, and replace `choicePending` with the returned pending state.
3. `confirmChooseN` calls `worker.advanceChooseN(...)` with `{ type: 'confirm' }`. On `{ done: true, value }`, it writes the finalized array into `partialMove.params[decisionKey]`, appends the choice to `choiceStack`, and resumes the existing `legalChoices(...)` progression exactly once.
4. The old atomic `chooseN(fullArray)` action should be removed, not retained as a compatibility alias. The user requirement for this ticket is no backwards compatibility/aliasing; callers should migrate to the incremental actions directly.
5. The render-model/UI layer should expose and render engine-owned multi-select progress rather than re-deriving it from option counts or local component state. This is the cleaner long-term architecture because legality and confirmation readiness stay in one place.

## What to Change

### 1. Replace atomic store action with incremental store actions

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'add', value })`. On success (`done: false`), updates `choicePending` with the returned pending request. On error, surfaces the error to the UI.

### 2. Add `removeChooseNItem` store action

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'remove', value })`. On success, updates `choicePending`.

### 3. Add `confirmChooseN` store action

Calls `worker.advanceChooseN(partialMove, decisionKey, currentSelected, { type: 'confirm' })`. On `{ done: true, value }`, writes the finalized array into `Move.params[decisionKey]` and advances the decision sequence. On `{ done: false }` (confirmation rejected), updates `choicePending` with the rejection reason.

### 4. Update render-model discrete-many payload

Extend `RenderChoiceUi` / `derive-render-model.ts` so `discreteMany` carries the engine-owned selected values and confirm state needed by the UI. The UI should not infer these from bounds and local toggle state.

### 5. Replace local multi-select UI state with engine-driven interactions

Update `ChoicePanel` multi-select mode to:

- render current selection from the store/render model
- dispatch `addChooseNItem(value)` / `removeChooseNItem(value)` on toggle
- dispatch `confirmChooseN()` on confirmation
- use engine-provided confirm state instead of recomputing it locally

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify — remove atomic `chooseN`, add incremental actions)
- `packages/runner/src/model/render-model.ts` (modify — extend `discreteMany` payload for engine-owned selection state)
- `packages/runner/src/model/derive-render-model.ts` (modify — project `selected` / `canConfirm` from `choicePending`)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify — remove local multi-select state, wire incremental actions)
- `packages/runner/test/store/game-store.test.ts` (modify — add store action coverage)
- `packages/runner/test/store/game-store-async-serialization.test.ts` (modify — preserve stale-operation protections for incremental flow)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modify — assert discrete-many projection includes engine-owned state)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify — assert incremental UI dispatch and engine-driven selection rendering)

## Out of Scope

- Worker/bridge implementation details — already present and covered elsewhere
- Broad visual redesign of `ChoicePanel`; only the interaction model and state source change here
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
5. `confirmChooseN`: on `{ done: true }`, writes finalized array to move params, appends the resolved decision to `choiceStack`, and advances the decision sequence
6. `confirmChooseN`: on rejection (for example below min), preserves the pending decision and surfaces the worker error
7. `RenderChoiceUi.kind === 'discreteMany'` includes the engine-owned selected values and confirm readiness needed by the UI
8. `ChoicePanel` multi-select mode dispatches incremental add/remove/confirm actions and does not maintain its own selected-values source of truth
9. `chooseOne` action is completely unaffected
10. `pnpm -F @ludoforge/runner typecheck` succeeds
11. `pnpm -F @ludoforge/runner test` succeeds without regressions

### Invariants

1. `choicePending.selected` is always the engine-returned value; the runner never reconstructs authoritative multi-select state locally
2. `choicePending.canConfirm` is always the engine-returned value; the runner never recomputes authoritative confirmation readiness
3. The only array written into `partialMove.params[decisionKey]` is the finalized result returned by `advanceChooseN(..., { type: 'confirm' })`
4. `chooseOne` flow is completely unchanged
5. No game-specific identifiers in runner/store/model/UI code

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — incremental store action behavior and move progression
2. `packages/runner/test/store/game-store-async-serialization.test.ts` — stale incremental operations do not overwrite newer state
3. `packages/runner/test/model/derive-render-model-state.test.ts` — discrete-many projection includes engine-owned selected/confirm state
4. `packages/runner/test/ui/ChoicePanel.test.ts` — UI dispatches add/remove/confirm incrementally and renders engine-owned selection

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`

## Outcome

- Completed: 2026-03-14
- What actually changed:
  - Replaced the runner store's atomic `chooseN(...)` action with `addChooseNItem(...)`, `removeChooseNItem(...)`, and `confirmChooseN()`, all backed by `worker.advanceChooseN(...)`.
  - Updated the store to write the finalized `chooseN` array into `partialMove.params[decisionKey]` only after worker confirmation, then continue the existing decision-sequence flow through `legalChoices(...)`.
  - Extended runner `discreteMany` render-model payloads to carry UI-facing projections of engine-owned multi-select state (`selectedChoiceValueIds`, `canConfirm`).
  - Reworked `ChoicePanel` multi-select mode to render engine-owned selection state and dispatch incremental add/remove/confirm actions instead of maintaining local React selection state.
  - Updated runner store, async-serialization, render-model, UI, and supporting fixture tests to match the incremental protocol.
- Deviations from original plan:
  - The ticket originally scoped the work as store-only and treated ChoicePanel work as out of scope. Reassessment showed that would preserve the old local-state architecture, so the implemented scope also included render-model and `ChoicePanel` plumbing.
  - The ticket originally described rejected confirm operations as `{ done: false }` responses. The actual worker/runtime contract throws on invalid confirmation, so the runner now preserves pending state and surfaces the worker error instead.
  - The old `chooseN(...)` action was removed rather than retained as a compatibility helper, per the no-aliasing requirement.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
