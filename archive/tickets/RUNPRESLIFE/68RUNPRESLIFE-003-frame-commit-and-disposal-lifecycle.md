# 68RUNPRESLIFE-003: Harden Canvas Commit Boundary and Centralize Stale-Node Retirement

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-002-retained-text-runtime.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/tickets/RENDERLIFE-001.md

## Problem

The runner still mixes two lifecycle concerns in hot paths:

- live Pixi tree mutation inside renderers
- stale-node retirement / deferred teardown policy

`createCanvasUpdater()` already acts as the frame commit boundary and already applies a canonical presentation scene into ordered renderer updates. The remaining architectural gap is narrower: some renderers retire stale Pixi nodes through the shared disposal queue while others still destroy stale nodes inline. That makes teardown policy inconsistent and harder to reason about against Pixi text/texture lifecycle bugs.

## Assumption Reassessment (2026-03-18)

1. `createCanvasUpdater()` already is the canonical frame commit boundary for steady-state canvas presentation. It builds a `PresentationScene` and applies renderers in a stable order from one place — confirmed in `packages/runner/src/canvas/canvas-updater.ts`.
2. Archived ticket `68RUNPRESLIFE-006` already completed the missing token-scene and action-announcement presentation derivation work. This ticket should no longer assume scene migration is blocked on that effort — confirmed in `archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md` and the current `packages/runner/src/presentation/` modules.
3. Deferred disposal already exists and is used by token/animation paths, but stale-node retirement is still inconsistent across hot-path renderers. `token-renderer.ts` uses `createDisposalQueue()`, while `adjacency-renderer.ts` still destroys stale graphics inline — confirmed in the current runner canvas renderers.
4. `safeDestroyDisplayObject()` is still necessary as an emergency boundary around Pixi destroy failures, but it should not be a renderer-local policy decision in ordinary stale-node retirement paths. The fallback counter and tests already exist in `packages/runner/src/canvas/renderers/safe-destroy.ts` and `packages/runner/test/canvas/renderers/safe-destroy.test.ts`.
5. Lifecycle coverage is stronger than previously assumed. `GameCanvas.test.ts`, `canvas-updater.test.ts`, `disposal-queue.test.ts`, and `safe-destroy.test.ts` already cover destroy ordering, remount behavior, subscription cleanup, and fallback accounting. This ticket should extend those tests rather than invent an entirely new test surface by default.

## Architecture Check

1. A single stale-node retirement policy is cleaner than multiple renderer-local teardown rules. The right place to enforce it is the existing frame commit boundary, not a second runtime layered on top of `CanvasUpdater`.
2. This remains fully runner-only and presentation-only. `GameDef` and simulation do not gain any presentation lifecycle knowledge.
3. No backwards-compatibility shim should preserve renderer-local retirement policy for ordinary stale-node cleanup. Renderers participating in the steady-state commit path should retire stale nodes through the shared queue/boundary.
4. Introducing a second "commit runtime" between `GameCanvas` and `CanvasUpdater` would now be redundant architecture. It would duplicate ordering already owned by `createCanvasUpdater()` while increasing indirection.
5. Direct `safeDestroy*` usage can still remain in true teardown-only helpers and emergency fallback boundaries where there is no live commit transaction. The architectural goal here is not "zero imports everywhere"; it is "one canonical retirement path for ordinary stale-node removal in steady-state rendering."

## What to Change

### 1. Centralize stale-node retirement on the existing commit boundary

Extend the current canvas lifecycle so ordinary stale-node retirement uses the shared deferred-disposal path consistently during frame commits:

- stale adjacency graphics removed during ordinary updates should be parked through the shared queue, not destroyed inline
- token subcontainers/content retired during ordinary updates should use the same queue when they are detached from still-live parents
- `GameCanvas` destroy should continue to flush the queue only after renderer shutdown so retirement happens after the commit boundary

Do not add a second commit runtime layer unless implementation proves the current `CanvasUpdater` boundary cannot express the needed ordering.

### 2. Narrow disposal to an exceptional boundary

Refactor `safe-destroy.ts` and `disposal-queue.ts` so that:

- normal stale-node retirement uses the existing commit boundary’s canonical queue path
- `safeDestroyDisplayObject()` becomes an emergency fallback, not an expected steady-state mechanism
- ordinary steady-state renderer update code no longer decides its own retirement policy ad hoc

### 3. Add lifecycle integration coverage

Add or strengthen tests around the existing lifecycle surfaces rather than assuming a brand-new test file is required. Coverage should include repeated mount/update/unmount/remount and stale-node retirement assertions while:

- toggling animations
- changing overlays
- changing token stacks and card faces
- updating FITL board state

Those tests should assert zero unexpected destroy fallbacks and zero console errors for the exercised lifecycle paths.

## Files to Touch

- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/canvas/renderers/disposal-queue.ts` (modify or replace)
- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/renderers/disposal-queue.test.ts` (modify)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify if token content retirement changes)
- optionally one new lifecycle-focused canvas test file under `packages/runner/test/canvas/` only if the gap cannot be expressed cleanly in the existing suites

## Out of Scope

- game-specific FITL rendering tweaks
- visual-config schema authoring by itself
- screenshot refresh
- replacing `CanvasUpdater` with a second orchestration layer without evidence that the current boundary is insufficient

## Acceptance Criteria

### Tests That Must Pass

1. Existing `CanvasUpdater`/`GameCanvas` lifecycle tests prove repeated mount/update/unmount/remount flows complete without console errors or unexpected destroy fallbacks in the exercised paths.
2. Ordinary stale-node retirement in steady-state renderer updates no longer mixes shared-queue retirement and inline destroy arbitrarily.
3. Direct `safeDestroy*` calls that remain are teardown-only or exceptional fallback boundaries, not ordinary stale-node retirement during frame commits.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. The runner has exactly one canonical steady-state commit boundary: `createCanvasUpdater()` plus the shared deferred retirement queue used by commit-participating renderers.
2. Fallback destroy logic is exceptional, observable, and test-failing when it appears in normal flows.
3. Presentation lifecycle remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.test.ts` — repeated lifecycle/remount behavior and fallback-free destroy ordering
2. `packages/runner/test/canvas/renderers/disposal-queue.test.ts` — shared queue retirement semantics
3. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — stale adjacency retirement goes through the queue rather than inline destroy
4. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — deferred retirement for token content/container subtrees if token teardown changes
5. `packages/runner/test/canvas/canvas-updater.test.ts` — existing commit boundary remains the single orchestration layer

### Commands

1. `pnpm -F @ludoforge/runner test -- GameCanvas.test.ts canvas-updater.test.ts disposal-queue.test.ts adjacency-renderer.test.ts token-renderer.test.ts safe-destroy.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - corrected the ticket scope before implementation: `CanvasUpdater` already owns the steady-state frame commit boundary, so the implementation hardened that existing boundary instead of adding a redundant second lifecycle runtime
  - updated `adjacency-renderer.ts` so stale adjacency graphics now retire through the shared deferred disposal queue instead of being destroyed inline during ordinary updates
  - updated `token-renderer.ts` so removed card-content subcontainers retire through the same shared queue when detached from still-live token containers
  - updated `GameCanvas.tsx` wiring so the adjacency renderer participates in the same shared retirement path already used by token/animation flows
  - added/updated runner tests covering deferred retirement for stale adjacency graphics and detached token card-content containers
- What changed versus the original plan:
  - did not introduce a new commit-phase runtime between `GameCanvas` and `CanvasUpdater`; that would have duplicated architecture the runner already has
  - did not broadly remove every `safeDestroy*` call from the codebase; teardown-only and emergency fallback boundaries still legitimately use those helpers
  - reused and strengthened existing lifecycle suites instead of adding a separate `canvas-lifecycle.test.ts` file
- Verification results:
  - `pnpm -F @ludoforge/runner test -- GameCanvas.test.ts canvas-updater.test.ts disposal-queue.test.ts adjacency-renderer.test.ts token-renderer.test.ts safe-destroy.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
