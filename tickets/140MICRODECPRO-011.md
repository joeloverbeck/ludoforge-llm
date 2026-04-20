# 140MICRODECPRO-011: D7 — Runner store + UI adaptation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/140MICRODECPRO-010.md`

## Problem

With the worker bridge rewritten (ticket 010), the runner store still tracks speculative partial-move state (`selectedAction`, `choiceStack`, `partialMove`, `choicePending`) that the kernel now owns via the decision stack. This ticket collapses the store's redundant state tracking into derived projections of the current microturn and rewires the UI components to render off `currentMicroturn` directly.

## Assumption Reassessment (2026-04-20)

1. `packages/runner/src/store/game-store.ts` (1363 lines) declares `selectedAction`, `partialMove`, `choiceStack`, `choicePending` — confirmed by Explore agent during reassessment.
2. Current store actions: `selectAction`, `chooseOne`, `addChooseNItem`, `removeChooseNItem`, `confirmChooseN`, `cancelChoice`, `confirmMove`, `resolveAiStep` — confirmed.
3. UI components live at `packages/runner/src/ui/*.tsx` (not `components/`) — confirmed: `ChoicePanel.tsx`, `ActionToolbar.tsx`, `InterruptBanner.tsx`, `IllegalityFeedback.tsx`.
4. `agentTurnOrchestrator` is actively used (7 call sites in game-store.ts) — confirmed.
5. `VisualConfigProvider` is consumed by 31 files including game-store.ts and project-render-model.ts — confirmed. No changes needed here.
6. Per spec 140 D7 and user guidance during reassessment, new store action names (`submitActionSelection`, `submitChoice`, `submitChooseNStep`, `rewindToCurrentTurnStart`) are adopted — no attachment to existing names.

## Architecture Check

1. F14 compliant: `selectedAction`, `partialMove`, `choiceStack`, `choicePending` retire as store fields; replaced by derived projections of `currentMicroturn`. No dual-source state tracking.
2. Single source of truth: the kernel (via the bridge's `publishMicroturn`) owns the decision frontier. The store projects it; it does not reconstruct.
3. Rules-protocol unity (F5): UI gestures map directly to `applyDecision` calls via the new store actions — no runner-side legality reconstruction.
4. Visual separation (F3): `VisualConfigProvider` is unaffected; still query-only, still read from `visual-config.yaml`.

## What to Change

### 1. Refactor `packages/runner/src/store/game-store.ts`

Delete store fields:
- `selectedAction` — derive from `currentMicroturn.compoundTurnTrace[0]?.decision`.
- `choiceStack` — derive from `currentMicroturn.compoundTurnTrace`.
- `partialMove` — delete entirely.
- `choicePending` — replace with `currentMicroturn: MicroturnState | null`.

Add new store actions (per reassessed spec 140 D7):

- `submitActionSelection(actionId)`: calls `bridge.applyDecision({ kind: 'actionSelection', actionId }, stamp)`, then re-publishes the microturn.
- `submitChoice(value)`: calls `bridge.applyDecision({ kind: 'chooseOne', value }, stamp)`.
- `submitChooseNStep(command)`: calls `bridge.applyDecision({ kind: 'chooseNStep', command: 'add'/'remove'/'confirm', value? }, stamp)`.
- `rewindToCurrentTurnStart()`: calls `bridge.rewindToTurnBoundary(currentTurnId, stamp)`.
- `runAiStep()`: under microturns, one AI step is one microturn — the existing `agentTurnOrchestrator` iterates microturns until seat change or terminal.

Delete old actions: `selectAction`, `chooseOne`, `addChooseNItem`, `removeChooseNItem`, `confirmChooseN`, `cancelChoice`, `confirmMove`. All call sites migrate.

### 2. Update `packages/runner/src/ui/ChoicePanel.tsx`

Render directly off `currentMicroturn`:

- `decisionContextKind === 'chooseOne'` → existing chooseOne rendering, buttons call `submitChoice`.
- `decisionContextKind === 'chooseNStep'` → existing chooseN rendering with add/remove/confirm buttons, calling `submitChooseNStep` with the appropriate command.
- `decisionContextKind === 'actionSelection'` → defer to `ActionToolbar`.
- `decisionContextKind === 'turnRetirement' | 'stochasticResolve' | 'outcomeGrantResolve'` → never shown (auto-advanced before publication).

### 3. Update `packages/runner/src/ui/ActionToolbar.tsx`

Click handler calls `submitActionSelection(actionId)` instead of `selectAction`. Render reads the list of `eligibleActions` from `currentMicroturn.decisionContext` (when `kind === 'actionSelection'`).

### 4. Update `packages/runner/src/ui/InterruptBanner.tsx`

Rewire to consume `currentMicroturn.compoundTurnTrace` and the decision-stack frames for interrupt/reaction context, not the runner-reconstructed `choicePending` + `partialMove` pair.

### 5. Update `packages/runner/src/ui/IllegalityFeedback.tsx`

Simplification — microturn `legalActions` already enforce legality, so the kernel never publishes an illegal action. The IllegalityFeedback component's responsibility narrows to surfacing eligibility-predicate failures for greyed-out actions, not post-click illegality reconstruction.

### 6. Update runner tests

Every test exercising old store actions (`selectAction`, `chooseOne`, etc.) migrates to the new action names. UI snapshot tests (if any) may need updates to match the new rendering path.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify — field deletions, new actions, migration of internal logic)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/src/ui/ActionToolbar.tsx` (modify)
- `packages/runner/src/ui/InterruptBanner.tsx` (modify)
- `packages/runner/src/ui/IllegalityFeedback.tsx` (modify — simplification)
- `packages/runner/test/store/game-store.test.ts` (modify — action names, fields)
- `packages/runner/test/ui/*.test.tsx` — likely updates for new store action names (if such tests exist; glob at ticket start).

## Out of Scope

- Engine-side changes (tickets 006/007).
- Worker bridge changes (ticket 010).
- VisualConfigProvider — unchanged per reassessed spec.
- Tests T6 / T9 / T13 — ticket 014.
- Certificate machinery retirement — ticket 012.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner build` — runner compiles cleanly.
2. `pnpm -F @ludoforge/runner test` — all existing tests pass after migration to new store actions.
3. Manual smoke: `pnpm -F @ludoforge/runner dev` — start the runner, load a FITL game, complete a compound turn using the UI. No console errors, UI progresses decision-by-decision.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. Grep `packages/runner/src/store/` for `partialMove|selectedAction|choiceStack|choicePending` — zero hits as store fields (derived getters may reference these names as read-only projections).
2. Store is a thin projection: no store action reconstructs legality; all legality comes from `currentMicroturn.legalActions`.

## Test Plan

### New/Modified Tests

- Existing store tests migrate to new action names; field assertions update to reference derived projections.
- T6 (bounded termination over canary corpus) and T13 (compound-turn summary) authored in ticket 014.

### Commands

1. `pnpm -F @ludoforge/runner build`
2. `pnpm -F @ludoforge/runner test`
3. Manual: `pnpm -F @ludoforge/runner dev` — exercise UI choice flow.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
