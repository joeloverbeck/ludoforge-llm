# ANIMPIPE-003: Granular error handling + forceFlush

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

This ticket originally assumed missing resilience in the animation pipeline. A fresh code/test review shows the proposed architecture and tests are already implemented; the remaining work is verification and closure.

## Assumption Reassessment (2026-02-21)

Discrepancies vs original assumptions:

1. `packages/runner/src/animation/animation-controller.ts` already uses split error handling in `processTrace`:
- descriptor mapping failure path reports `Descriptor mapping failed.` and returns.
- timeline build failure path reports `Timeline build failed.` and keeps controller alive.
2. `packages/runner/src/animation/animation-queue.ts` already exposes and implements `forceFlush(): void`.
3. `packages/runner/src/animation/animation-controller.ts` interface already exposes `forceFlush(): void` and delegates to queue.
4. Coverage already exists in:
- `packages/runner/test/animation/animation-controller.test.ts`
- `packages/runner/test/animation/animation-queue.test.ts`

## Architecture Reassessment

1. The split mapping/timeline error boundaries are cleaner and more robust than a monolithic try/catch because each failure mode is isolated and recoverable.
2. Queue-level `forceFlush` is an appropriate lifecycle primitive for deterministic reset semantics and is architecturally better than ad hoc controller-side cleanup.
3. Current architecture is directionally correct for extensibility: controller owns orchestration, queue owns playback state and teardown behavior.

## Updated Scope

1. Validate the existing implementation against acceptance criteria with hard test execution.
2. Confirm no architectural regressions in queue reset/recovery semantics.
3. If verification fails, fix code/tests minimally in-scope.
4. If verification passes, mark complete and archive.

## Files In Scope

- `tickets/ANIMPIPE-003.md` (update + completion metadata)
- `packages/runner/src/animation/animation-controller.ts` (verify only unless failures require changes)
- `packages/runner/src/animation/animation-queue.ts` (verify only unless failures require changes)
- `packages/runner/test/animation/animation-controller.test.ts` (verify only unless failures require changes)
- `packages/runner/test/animation/animation-queue.test.ts` (verify only unless failures require changes)

## Out of Scope

- Subscriber ordering (ANIMPIPE-002)
- Canvas-ready gating (ANIMPIPE-002)
- Stagger/parallel sequencing (ANIMPIPE-004)

## Acceptance Criteria

1. `traceToDescriptors` throws -> error reported via `onError`, future traces still processed.
2. `buildTimeline` throws -> error reported via `onError`, future traces still processed.
3. `forceFlush()` empties queue and kills active/queued timelines.
4. `forceFlush()` sets `animationPlaying` to `false`.
5. After `forceFlush()`, new traces/timelines can be processed normally.
6. Runner validation passes: tests, typecheck, lint.

## Test Plan

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-controller.test.ts packages/runner/test/animation/animation-queue.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-21
- What changed:
- Reassessed and corrected stale ticket assumptions/scope based on current source and tests.
- Re-scoped ticket from implementation to verification/closure because the feature set was already present.
- What changed vs originally planned:
- No runner source or test code changes were required; original planned implementation had already landed.
- Verification results:
- `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-controller.test.ts packages/runner/test/animation/animation-queue.test.ts` passed.
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
- `pnpm -F @ludoforge/runner lint` passed.
