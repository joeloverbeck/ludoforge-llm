# BLKDACTUI-001: Blocked actions must be visually disabled and non-interactive

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

In the runner UI, action buttons whose preconditions are not satisfied (e.g., Pivotal Event requiring a specific event card) appear as enabled and clickable even though the tooltip correctly shows "Blocked". Users can click through the entire choice-confirmation flow and submit the move, which executes as a no-op. This is confusing — blocked actions should be visually disabled and non-interactive.

**Observed in**: FITL game, Pivotal Event action. Tooltip shows "Blocked — Need Event Card Id = Card 121" but the button is enabled. User can select choices and confirm (screenshots: `screenshots/fitl-pivotal-event-1.png`, `screenshots/fitl-pivotal-event-2.png`).

## Assumption Reassessment (2026-04-04)

1. **Pivotal events always in legalMoves**: Confirmed. `classifyMoves()` in `legal-moves.ts:273` only includes `viable: true` moves. Pivotal events pass viability probing because the `playCondition` is checked at execution time, not enumeration (per `feedback_pivotal_play_condition_timing.md`).
2. **`deriveActionGroups()` marks all moves as `isAvailable: true`**: Confirmed at `derive-runner-frame.ts:1189` — hardcoded `isAvailable: true` for every move in the enumeration.
3. **`ActionToolbar` already handles disabled state**: Confirmed at `ActionToolbar.tsx:48` — `disabled={!action.isAvailable}` and click guard at line 52. No UI changes needed if `isAvailable` is correctly set.
4. **`describeAction()` provides accurate availability**: Confirmed. `buildRuleState()` in `condition-annotator.ts:434` evaluates `action.pre` and returns `RuleState.available: boolean` with blocker details. The `AnnotatedActionDescription.tooltipPayload.ruleState.available` field is the source of truth.

## Architecture Check

1. The fix keeps availability logic in the runner's frame derivation layer — the engine's legal move semantics (include all viable moves) are preserved unchanged.
2. No engine changes: the `describeAction()` API already exists and returns `ruleState.available`. We consume it in the runner.
3. No backwards-compatibility shims — `RunnerAction.isAvailable` already exists and is already consumed by `ActionToolbar`. We just set it correctly.

## What to Change

### 1. Eager action availability in frame derivation

In `derive-runner-frame.ts`, modify the call site at line 134 to also compute availability for each unique action ID by calling `describeAction()` on the worker bridge. Pass the resulting `Map<actionId, boolean>` into `deriveActionGroups()`.

Update `deriveActionGroups()` signature to accept an availability map:
```typescript
function deriveActionGroups(
  moves: readonly Move[],
  availabilityByActionId: ReadonlyMap<string, boolean>,
): readonly RunnerActionGroup[]
```

Set `isAvailable: availabilityByActionId.get(actionId) ?? true` instead of hardcoded `true`.

**Important**: Frame derivation is currently synchronous. Since `describeAction()` is async (worker bridge call), the availability data must be computed asynchronously before derivation. This means the game store's `deriveAndSet` flow (or the `enumerateLegalMoves` step that precedes it) must also fetch action descriptions. The call site where `legalMoveResult` is stored and `deriveRunnerFrame` is called must be updated to also fetch and pass availability data.

### 2. Guard in `selectAction()` (defense-in-depth)

In `game-store.ts`, inside `selectAction()` (line 1025), before calling `bridge.legalChoices(baseMove)`, call `bridge.describeAction(actionId)` and check `tooltipPayload?.ruleState.available`. If `false`, set an error via `guardSetAndDerive` and return early, similar to the existing `illegal` choice handling.

### 3. Batch action description API (if needed for performance)

If calling `describeAction()` N times per frame derivation is too slow, add a `describeActions(actionIds: string[])` batch method to `GameWorkerAPI` that calls `engineDescribeAction` for each action in a single worker message. This is optional — profile first.

## Files to Touch

- `packages/runner/src/model/derive-runner-frame.ts` (modify) — accept and use availability map in `deriveActionGroups()`
- `packages/runner/src/store/game-store.ts` (modify) — fetch availability before derivation; add guard in `selectAction()`
- `packages/runner/src/worker/game-worker-api.ts` (modify) — optionally add batch `describeActions()` method

## Out of Scope

- Changing engine legal move enumeration semantics (pivotal events remain in legalMoves by design)
- Changing how `describeAction()` evaluates availability (already correct)
- Adding new visual styles for blocked buttons (existing `disabled` styling is sufficient)
- Handling the no-op execution case (the engine correctly handles this already)

## Acceptance Criteria

### Tests That Must Pass

1. Action with `ruleState.available === false` has `isAvailable: false` in derived `RunnerActionGroup`
2. Action with `ruleState.available === true` (or no ruleState) has `isAvailable: true`
3. `selectAction()` for a blocked action sets an error and does not enter the choice flow
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All actions in the legal moves enumeration appear in the toolbar (blocked actions are shown but disabled, not hidden)
2. `ActionToolbar` rendering logic (`disabled={!action.isAvailable}`) is unchanged
3. Engine legal move enumeration semantics are unchanged — no engine files modified

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-action-groups.test.ts` — unit test for `deriveActionGroups()` with availability map containing both `true` and `false` entries
2. `packages/runner/test/store/select-action-blocked.test.ts` — test that `selectAction()` rejects blocked actions with an error

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-04
- What changed:
  - `deriveActionGroups()` now derives `isAvailable` from runner-provided action availability instead of hardcoding `true`.
  - The runner store now computes action availability from `describeAction()` alongside legal-move refreshes and passes it into frame derivation.
  - `selectAction()` now rejects blocked actions up front and leaves move-construction state unset instead of entering the choice flow.
  - Added targeted coverage for derived action availability and blocked-action selection, and updated adjacent runner test helpers for the new render/store context field.
- Deviations from original plan:
  - No `GameWorkerAPI.describeActions()` batch API was added. The existing per-action `describeAction()` calls were sufficient for this ticket and no extra worker API surface was needed.
  - The live runner test surface used `packages/runner/test/store/game-store.test.ts` for the blocked-action store guard instead of creating a separate `select-action-blocked.test.ts` file.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
