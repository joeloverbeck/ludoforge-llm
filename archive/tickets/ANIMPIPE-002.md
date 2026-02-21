# ANIMPIPE-002: Enforce startup ordering and remove redundant canvas-ready gate

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

The original ticket assumptions are stale: startup ordering and related tests were already changed, but the ticket remained pending and still described work as unimplemented. The current architecture still carries a redundant `isCanvasReady` hook in animation controller options that does not protect any live path in runtime startup.

## Assumption Reassessment (2026-02-21)

1. `canvasUpdater.start()` already runs before `animationController.start()` in `GameCanvas.tsx`.
2. Lifecycle tests already assert `updater-start` before `animation-controller-start`.
3. `AnimationControllerOptions` includes optional `isCanvasReady`, and controller tests cover false/true/not-provided cases.
4. In current runtime wiring, `isCanvasReady` is effectively constant true at controller startup, so the guard does not add real safety.

## Architecture Reassessment

1. Startup ordering is the real invariant and should stay the primary contract.
2. Optional `isCanvasReady` introduces avoidable branching in shared controller code without meaningful runtime protection.
3. Clean architecture choice: remove this redundant option and keep one explicit invariant: updater starts first.
4. No backwards-compatibility shim is needed for this internal runner contract; tests and call sites should move to the cleaned API.

## Scope

### 1. Remove redundant `isCanvasReady` from animation controller

Modify `packages/runner/src/animation/animation-controller.ts`:

1. Remove `isCanvasReady` from `AnimationControllerOptions`.
2. Remove the `processTrace` readiness branch tied to that option.

### 2. Remove dead wiring in GameCanvas runtime

Modify `packages/runner/src/canvas/GameCanvas.tsx`:

1. Remove local `canvasReady` variable.
2. Stop passing `isCanvasReady` to `createAnimationController`.
3. Keep updater-before-animation startup order unchanged.

### 3. Realign tests to architecture

Modify `packages/runner/test/animation/animation-controller.test.ts`:

1. Remove tests that validate `isCanvasReady` false/true/not-provided behavior.
2. Keep coverage focused on trace subscription and timeline enqueue behavior.

Modify `packages/runner/test/canvas/GameCanvas.test.ts` only if needed to preserve explicit startup ordering invariant.

## Files to Touch

1. `packages/runner/src/canvas/GameCanvas.tsx` (modify)
2. `packages/runner/src/animation/animation-controller.ts` (modify)
3. `packages/runner/test/animation/animation-controller.test.ts` (modify)
4. `packages/runner/test/canvas/GameCanvas.test.ts` (optional, only if assertions need tightening)

## Out of Scope

1. Animation queue changes (ANIMPIPE-003)
2. Stagger/parallel sequencing (ANIMPIPE-004)
3. Preset changes (ANIMPIPE-005-007)

## Acceptance Criteria

### Tests That Must Pass

1. Lifecycle/startup order keeps `updater-start` before `animation-controller-start`.
2. Animation controller processes traces via existing flow without `isCanvasReady`.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Canvas updater always subscribes before animation controller.
2. Animation controller API contains no redundant readiness gate.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-controller.test.ts` - remove readiness-gate-only tests and keep core behavior coverage.
2. `packages/runner/test/canvas/GameCanvas.test.ts` - preserve startup ordering assertion (if update needed).

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.test.ts`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-controller.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-21
- What was changed:
1. Removed `isCanvasReady` from `AnimationControllerOptions` and deleted the associated readiness branch in `processTrace`.
2. Removed dead `canvasReady` wiring from `GameCanvas` while preserving updater-before-animation startup order.
3. Removed obsolete readiness-gate tests from animation controller coverage.
- Deviations from original ticket draft:
1. Original draft assumed ordering and readiness gate were not implemented; reassessment showed they were already present.
2. Scope was corrected toward architectural cleanup (remove redundant gate), not re-implementing already-landed behavior.
- Verification results:
1. `pnpm -F @ludoforge/runner test` passed.
2. `pnpm -F @ludoforge/runner typecheck` passed.
3. `pnpm -F @ludoforge/runner lint` passed.
