# ANIMPIPE-008: Animation pipeline integration coverage + Texas Hold'em visual-config update

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003, ANIMPIPE-004, ANIMPIPE-005, ANIMPIPE-006, ANIMPIPE-007

## Problem

The runner already has strong unit coverage for `traceToDescriptors`, `buildTimeline`, `animation-queue`, and `animation-controller`, but a dedicated cross-component integration test file is still missing. We also still need Texas Hold'em visual animation sequencing/timing values in visual config.

## Assumption Reassessment (2026-02-21)

1. No animation-pipeline integration test file exists at `packages/runner/test/animation/animation-pipeline-integration.test.ts` — confirmed.
2. Many behaviors proposed in this ticket are already covered:
   - Per-descriptor error isolation is covered in `packages/runner/test/animation/timeline-builder.test.ts`.
   - Stagger sequencing behavior is covered in `packages/runner/test/animation/timeline-builder.test.ts`.
   - `forceFlush` recovery is covered in `packages/runner/test/animation/animation-queue.test.ts` and `packages/runner/test/animation/animation-controller.test.ts`.
3. `data/games/texas-holdem/visual-config.yaml` currently has no `animations.sequencing` or `animations.timing` entries — confirmed.
4. There is no current architecture concept of “canvas-ready gating” in animation pipeline runtime, so that assumption is stale and removed from scope.

## Updated Scope and Architecture Decision

1. Keep existing architecture (`store` subscribers + `traceToDescriptors` + `buildTimeline` + `animation-queue`) and strengthen confidence with focused integration tests where coverage is currently fragmented.
2. Do not duplicate existing unit test assertions in a second file without adding integration value.
3. Keep existing runtime ordering coverage in `packages/runner/test/canvas/GameCanvas.test.ts` as-is; do not duplicate it.
4. Keep Texas Hold'em animation behavior in game visual config (data-driven, no runner branching).
5. No backwards-compatibility aliases or shims.

## What to Change

### 1. Add focused animation pipeline integration tests

New file `packages/runner/test/animation/animation-pipeline-integration.test.ts`:

Tests:
1. **Store-to-queue integration**: one effectTrace update goes through real `traceToDescriptors` + real `buildTimeline` and enqueues a playable timeline.
2. **Pipeline resiliency**: first trace causing descriptor/timeline processing failure does not prevent a subsequent valid trace from enqueueing.
3. **Sequencing+timing from visual config provider**: verify configured per-kind policies/overrides are forwarded through controller and affect timeline build inputs.

### 2. Update Texas Hold'em visual-config

Modify `data/games/texas-holdem/visual-config.yaml`:

```yaml
animations:
  sequencing:
    cardDeal: { mode: stagger, staggerOffset: 0.15 }
  timing:
    cardDeal: { duration: 0.3 }
    cardFlip: { duration: 0.3 }
```

## Files to Touch

- `packages/runner/test/animation/animation-pipeline-integration.test.ts` (new)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Re-implementing behavior already comprehensively covered by existing unit tests without added integration value.
- Introducing architecture changes to animation runtime orchestration.
- FITL visual-config changes.
- Manual browser testing automation.

## Acceptance Criteria

### Tests That Must Pass

1. New integration tests in `packages/runner/test/animation/animation-pipeline-integration.test.ts` pass.
2. Existing runtime ordering test in `packages/runner/test/canvas/GameCanvas.test.ts` still passes.
3. Existing targeted animation and canvas tests pass.
4. `pnpm -F @ludoforge/runner test` passes.
5. `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. Tests use mocked GSAP-compatible timeline stubs; no real animation runtime required.
2. Texas Hold'em visual-config remains schema-valid.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-pipeline-integration.test.ts` — new integration coverage.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-pipeline-integration.test.ts`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-21
- Actually changed:
  - Added `packages/runner/test/animation/animation-pipeline-integration.test.ts` with focused cross-component tests for real `traceToDescriptors` + `buildTimeline` controller flow, resiliency after a failed build, and sequencing/timing option forwarding.
  - Updated `data/games/texas-holdem/visual-config.yaml` with `animations.sequencing.cardDeal` stagger policy and `animations.timing` durations for `cardDeal`/`cardFlip`.
  - Reassessed and corrected ticket scope before implementation to remove stale assumptions (notably canvas-ready gating) and avoid duplicating already-covered unit behavior.
- Deviations from original plan:
  - Did not add a new canvas-ordering test because that invariant is already explicitly asserted in `packages/runner/test/canvas/GameCanvas.test.ts`.
  - Kept architecture unchanged; this ticket strengthens verification and data configuration only.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
