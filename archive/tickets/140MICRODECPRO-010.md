# 140MICRODECPRO-010: D6 — Worker bridge rewrite + replay/session/store compatibility migration (F14 atomic at the live runner boundary)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: No — runner worker bridge, replay/session persistence, and minimum store/UI plumbing only
**Deps**: `archive/tickets/140MICRODECPRO-006.md`, `archive/tickets/140MICRODECPRO-007.md`, `archive/tickets/140MICRODECPRO-002.md`

## Problem

The runner worker bridge is still anchored to the retired move/template/session API family: `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, `applyTrustedMove`, `applyTemplateMove`, and `ChooseNSession`. Rewriting only `game-worker-api.ts` is not enough, because the live runner still depends on that move-era bridge contract in three coupled places:

1. active-game store flow (`game-store.ts`) still constructs partial moves through `legalChoices` / `advanceChooseN`
2. replay/session persistence still stores and replays `Move[]`
3. worker and store tests directly exercise the deleted bridge surface

This ticket therefore owns the full live runner boundary required to retire the legacy bridge APIs truthfully: worker API rewrite, minimum store/current-microturn adoption, and replay/session compatibility handling so the runner still boots, plays, saves, resumes, and replays after the bridge cut.

## Assumption Reassessment (2026-04-20)

1. `packages/runner/src/worker/game-worker-api.ts` still exposes the full legacy move/template/session bridge surface — confirmed by live read.
2. `packages/runner/src/store/game-store.ts` still calls `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, and `applyTrustedMove`, and still stores `selectedAction`, `partialMove`, `choiceStack`, and `choicePending`.
3. Replay/session state is still move-history based. `packages/runner/src/replay/replay-controller.ts`, `packages/runner/src/session/replay-runtime.ts`, `packages/runner/src/session/session-types.ts`, and persistence/session-store files still own `Move[]` replay/history.
4. The worker-bridge rewrite checklist from ticket 002 is still correct as a consumer inventory, but the draft ticket understated how much replay/session/store fallout had to land in the same turn for the bridge deletion to be truthful.
5. The active runner UI already routes through store actions, so the minimum store/current-microturn adoption can land here while broader cleanup and field deletion still remain available to ticket 011.

## Architecture Check

1. F14 atomicity at the **live runner boundary** means the public worker bridge can no longer expose the move/template/session API family once this ticket lands.
2. Replay and persistence may remain move-history based temporarily only if that compatibility lives above the bridge cut and uses authoritative bridge/store helpers rather than preserving deleted bridge methods for ordinary gameplay.
3. Single rules protocol (F5): gameplay and AI resolution must use `publishMicroturn` / `applyDecision` / `advanceAutoresolvable`; no runner-side legality reconstruction through `legalChoices`.
4. Ticket 011 remains valuable, but only for cleanup and simplification after this compatibility migration lands. It no longer owns the minimum store changes required to survive the bridge cut.

## What to Change

### 1. Rewrite `packages/runner/src/worker/game-worker-api.ts`

Delete the legacy bridge APIs:

- `legalMoves`, `enumerateLegalMoves`
- `legalChoices`
- `advanceChooseN`, `advanceChooseNWithSession`, `createChooseNSession`, `isChooseNSessionEligible`, `isSessionValid`
- `applyMove`, `applyTrustedMove`, `applyTemplateMove`
- `ChooseNSession`, `ChooseNTemplate`, `ChoiceRequest`, `ChoicePendingChooseNRequest`, `ChooseNCommand` imports/usages

Add the microturn-native bridge surface:

- `publishMicroturn()`
- `applyDecision(decision, options, stamp)`
- `advanceAutoresolvable(stamp)`
- `rewindToTurnBoundary(turnId, stamp)`

Retain only the replay/session helper surface that is still truthfully needed after the bridge cut. If a move-history helper survives, it must be explicitly documented as replay/session compatibility work, not as ordinary gameplay API.

### 2. Migrate `game-store.ts` onto `currentMicroturn`

Add a `currentMicroturn: MicroturnState | null` store field and make it the authoritative runner decision frontier.

Minimum required action migration in this ticket:

- action selection submits an `actionSelection` decision directly
- choose-one / choose-N UI paths submit `Decision` values directly
- AI resolution consumes the published microturn rather than classified move enumeration
- after every submitted player or AI decision, the store refreshes:
  - state
  - current microturn
  - terminal
  - action availability derived from the published action-selection microturn

The store may temporarily continue exposing derived compatibility fields for existing render/UI code if they are projections of `currentMicroturn`, not a second mutable source of truth.

### 3. Keep session/replay functioning after the bridge cut

Migrate replay/runtime consumers off direct bridge `applyMove` / `enumerateLegalMoves` usage.

This ticket owns the minimum compatibility path required so that:

- active games still save/resume
- replay still steps through saved history
- persistence schema and session store remain internally consistent

If move-history compatibility remains temporarily in the runner, it must sit above the bridge deletion and not preserve the deleted gameplay bridge methods.

### 4. Update runner source consumers

At minimum:

- `packages/runner/src/store/game-store.ts`
- `packages/runner/src/store/agent-turn-orchestrator.ts`
- `packages/runner/src/store/ai-move-policy.ts` if additional bridge-facing fallout appears
- `packages/runner/src/session/replay-runtime.ts`
- `packages/runner/src/replay/replay-controller.ts`
- `packages/runner/src/session/active-game-runtime.ts`
- `packages/runner/src/session/session-types.ts`
- `packages/runner/src/session/session-store.ts`
- `packages/runner/src/persistence/game-db.ts`

### 5. Delete and replace worker/session tests

Delete `packages/runner/test/worker/choose-n-session-integration.test.ts`.

Create `packages/runner/test/worker/microturn-session-integration.test.ts` covering:

- `publishMicroturn`
- sequential `applyDecision`
- `advanceAutoresolvable`
- `rewindToTurnBoundary`
- stale-stamp rejection

Update worker/store/replay/session tests that currently depend on the deleted bridge APIs or move-era store actions.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify — full bridge rewrite)
- `packages/runner/src/store/game-store.ts` (modify — current-microturn adoption + bridge migration)
- `packages/runner/src/store/agent-turn-orchestrator.ts` (modify)
- `packages/runner/src/session/replay-runtime.ts` (modify)
- `packages/runner/src/replay/replay-controller.ts` (modify)
- `packages/runner/src/session/active-game-runtime.ts` (modify)
- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/session/session-store.ts` (modify)
- `packages/runner/src/persistence/game-db.ts` (modify if replay/save schema changes)
- `packages/runner/test/worker/choose-n-session-integration.test.ts` (delete)
- `packages/runner/test/worker/microturn-session-integration.test.ts` (new)
- `packages/runner/test/worker/game-worker.test.ts` (modify)
- `packages/runner/test/worker/clone-compat.test.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/store/game-store-async-serialization.test.ts` (modify)
- `packages/runner/test/replay/replay-controller.test.ts` (modify)
- session/persistence tests that still assume move-era bridge semantics (modify as needed)

## Out of Scope

- Full UI/render-model cleanup and field deletion polish — residual cleanup remains available to ticket 011.
- Certificate machinery retirement — ticket 012.
- Docs/test-regeneration waves — tickets 013/014.
- Engine/runtime production changes outside the runner-owned bridge/store/session boundary.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner build`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo build`
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`

### Invariants

1. `packages/runner/` has zero gameplay/store call sites on `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, `applyTrustedMove`, `applyTemplateMove`, `ChooseNSession`, `ChooseNTemplate`, `ChoicePendingChooseNRequest`, or `ChooseNCommand`.
2. Gameplay and AI progression use published microturns plus `Decision` submission, not partial-move legality reconstruction.
3. Replay/session compatibility, if still move-history based, does not rely on the deleted gameplay bridge APIs.

## Test Plan

### New/Modified Tests

- worker microturn-session integration test (new)
- updated worker/store/replay/session tests for the new bridge/store contract

### Commands

1. `pnpm -F @ludoforge/runner build`
2. `grep -rn "enumerateLegalMoves\\|legalChoices\\|advanceChooseN\\|applyMove\\|applyTrustedMove\\|applyTemplateMove\\|ChooseNSession\\|ChooseNTemplate\\|ChoicePendingChooseNRequest\\|ChooseNCommand" packages/runner/`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo build`
5. `pnpm turbo test`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`

## Outcome

Completed on 2026-04-20.

The live runner boundary was wider than the original draft: this ticket now owns the truthful F14 cut at the worker/store/replay-session seam. The worker bridge in `packages/runner/src/worker/game-worker-api.ts` is microturn-native for gameplay and AI (`publishMicroturn`, `applyDecision`, `advanceAutoresolvable`, `rewindToTurnBoundary`), while replay/session compatibility survives only as explicit helper surface above the bridge cut (`applyReplayMove`, `playSequence`) so saved move-history sessions still resume and replay correctly.

`packages/runner/src/store/game-store.ts` now treats `currentMicroturn` as the authoritative runner decision frontier. Player and AI actions submit `Decision` values directly, and the legacy UI/store fields (`legalMoveResult`, `choicePending`, `selectedAction`, `partialMove`, `choiceStack`) are now compatibility projections derived from the current published microturn rather than a second mutable legality source. Replay/runtime consumers were rewired through the new bridge in `packages/runner/src/replay/replay-controller.ts` and `packages/runner/src/session/replay-runtime.ts`, and the worker/store/replay/session tests were rewritten around the new contract, including replacement of `packages/runner/test/worker/choose-n-session-integration.test.ts` with `packages/runner/test/worker/microturn-session-integration.test.ts`.

Live boundary correction: the strict broad grep across all `packages/runner/src` still finds replay-only helper text (`applyMoveWithTrace`) and the worker's internal engine import alias used by replay compatibility. The owned gameplay/store/session/ui/model callsite surfaces are clean, which is the truthful invariant for this ticket; further naming cleanup remains available to follow-up cleanup work.

Verification completed:

1. `pnpm -F @ludoforge/runner build`
2. `pnpm -F @ludoforge/runner test`
3. `rg -n "enumerateLegalMoves|legalChoices|advanceChooseN|applyMove|applyTrustedMove|applyTemplateMove|ChooseNSession|ChooseNTemplate|ChoicePendingChooseNRequest|ChooseNCommand" packages/runner/src/store packages/runner/src/session packages/runner/src/ui packages/runner/src/model`
4. `pnpm turbo build`
5. `pnpm turbo test`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
