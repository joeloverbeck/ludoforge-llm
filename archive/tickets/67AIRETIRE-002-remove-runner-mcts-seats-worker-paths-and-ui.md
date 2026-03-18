# 67AIRETIRE-002: Remove runner MCTS seats, worker paths, and UI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — trace seat-type contracts only
**Deps**: `67AIRETIRE-001`

## Problem

The runner still exposes MCTS as the default AI seat choice, routes MCTS seats through the worker bridge, and stores MCTS-specific seat unions in session/store/trace contracts. Retiring MCTS from the engine is incomplete unless the runner stops presenting or serializing those seats.

## Assumption Reassessment (2026-03-18)

1. `packages/runner/src/ui/PreGameConfigScreen.tsx` still offers `ai-mcts-fast`, `ai-mcts-default`, and `ai-mcts-strong`, and defaults non-human seats to `ai-mcts-default`.
2. `packages/runner/src/worker/game-worker-api.ts` still maps only MCTS seat types to worker AI profiles and throws `Unknown MCTS seat type` for anything else.
3. `packages/runner/src/session/session-types.ts`, `packages/runner/src/store/store-types.ts`, `packages/runner/src/store/ai-move-policy.ts`, `packages/runner/src/store/game-store.ts`, and `packages/engine/src/trace/trace-events.ts` still encode `ai-mcts-*` seat literals.

## Architecture Check

1. Removing MCTS seats outright is cleaner than remapping `ai-mcts-*` to random/greedy because remapping would preserve a false public contract.
2. This keeps game-specific bot behavior out of runner code. The runner should expose generic seat types that correspond to real supported agents, not frozen historical search profiles.
3. No backwards-compatibility aliases such as hidden `ai-mcts-default -> ai-greedy` conversions should be introduced.

## What to Change

### 1. Remove MCTS seat types and defaults

Delete all `ai-mcts-*` seat unions, option lists, defaults, worker request shaping, and trace payload branches. Replace runner defaults with one of the remaining supported seat types already implemented in the codebase.

### 2. Delete MCTS-only runner UX and tests

Remove MCTS-specific thinking/overlay/dashboard/state plumbing if it has no non-MCTS use. Update runner tests so they assert only supported seat types and worker flows.

## Files to Touch

- `packages/runner/src/ui/PreGameConfigScreen.tsx` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/engine/src/trace/trace-events.ts` (modify)
- `packages/runner/test/` (modify or delete MCTS-specific expectations)

## Out of Scope

- Engine MCTS source removal
- CI workflow and lane-script cleanup
- Top-level spec/ticket/report deletion and roadmap updates

## Acceptance Criteria

### Tests That Must Pass

1. Runner source no longer contains `ai-mcts-fast`, `ai-mcts-default`, or `ai-mcts-strong`.
2. The runner UI no longer presents MCTS as a seat option or default.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Session/store/trace contracts serialize only supported live seat types.
2. The runner does not preserve hidden compatibility handling for removed MCTS seat values.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/PreGameConfigScreen.test.tsx` — update seat option/default assertions.
2. `packages/runner/test/store/ai-move-policy.test.ts` — remove MCTS seat classification expectations.
3. `packages/runner/test/worker/game-worker.test.ts` — update worker AI routing coverage after MCTS removal.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-03-18
- What actually changed:
  - Removed all `ai-mcts-*` seat literals from runner session, store, UI, and trace-facing contracts.
  - Deleted the worker-side dedicated agent request path and the runner bridge logic that only existed to support MCTS seats.
  - Updated the pre-game seat picker to expose only `Human`, `AI - Greedy`, and `AI - Random`, with non-human defaults now set to `ai-greedy`.
  - Simplified AI move policy and game-store execution so all AI turns go through the live in-process agent selection path.
- Deviations from original plan:
  - The worker routing coverage was removed rather than remapped because the cleaner architecture is to eliminate the dead worker abstraction instead of preserving a compatibility branch.
  - This ticket landed in the same implementation pass as `67AIRETIRE-001` and `67AIRETIRE-003` so the repository remained buildable and testable throughout the retirement.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅
