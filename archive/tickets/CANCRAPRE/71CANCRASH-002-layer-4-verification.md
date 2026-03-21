# 71CANCRASH-002: Layer 4 — Pre-Destroy Render Guards

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The original ticket assumed Layer 4 was still missing in runner code. That assumption is no longer true. The runner already disables `renderable` and `visible` before the `destroy()` path begins in both `safeDestroyDisplayObject` and `destroyManagedText`.

The remaining job for this ticket is to validate that the implementation still matches Spec 71, tighten any missing regression coverage around destroy-time ordering, and archive the ticket with an accurate outcome.

## Assumption Reassessment (2026-03-21)

1. `safeDestroyDisplayObject` already sets `renderable = false` and `visible = false` before `destroy()` is called in `packages/runner/src/canvas/renderers/safe-destroy.ts`.
2. `destroyManagedText` already sets `text.renderable = false` and `text.visible = false` before `removeFromParent()` and before delegating to `safeDestroyDisplayObject` in `packages/runner/src/canvas/text/text-runtime.ts`.
3. `DestroyableDisplayObject` already declares optional `renderable` and `visible` properties, so the pre-destroy guard remains type-aligned with the abstraction in `safe-destroy.ts`.
4. Existing tests already prove most of the intended behavior:
   - `packages/runner/test/canvas/renderers/safe-destroy.test.ts` verifies the flags are false when `destroy()` is invoked.
   - `packages/runner/test/canvas/text/text-runtime.test.ts` verifies the flags are false before `removeFromParent()`.
5. The main remaining regression gap is that `destroyManagedText` is not yet explicitly proven to reach `destroy()` with `renderable` and `visible` already false.

## Architecture Check

1. The current architecture is directionally correct: the defensive hide-before-destroy behavior lives in shared runner lifecycle helpers instead of being duplicated at every call site.
2. `safeDestroyDisplayObject` is the right architectural choke point for generic display-object destruction. Keeping the pre-destroy guard there is cleaner and more extensible than scattering ad hoc flag writes across renderers.
3. `destroyManagedText` still benefits from an explicit pre-detach guard because text objects are the crash-sensitive subtype named by Spec 71. That local guard makes the ordering obvious and keeps text teardown self-contained.
4. No backwards-compatibility or aliasing is required. The current design is a strict improvement over the stale ticket's assumed architecture, and the only justified follow-up is stronger proof, not more production branching.

## What to Change

### 1. Do not change production code unless reassessment finds a real mismatch

The previously proposed source edits are already present. Reassess first, then only touch production code if the implementation diverges from Spec 71.

### 2. Strengthen regression coverage where the invariant is still implicit

Add or update tests only if they prove something the current suite does not already prove. The preferred target is `destroyManagedText`: assert that the `Text.destroy()` call observes `renderable = false` and `visible = false`, not just `removeFromParent()`.

## Files to Touch

- `tickets/71CANCRASH-002.md` (modify)
- `packages/runner/test/canvas/text/text-runtime.test.ts` (modify only if the destroy-time invariant is not already covered)
- `archive/tickets/` (move this ticket there after completion, with an Outcome section)

## Out of Scope

- Changes to `texture-pool-patch.ts` (71CANCRASH-001).
- Changes to `ticker-error-fence.ts`, `canvas-crash-recovery.ts`, or `game-canvas-runtime.ts`.
- Changes to the engine package.
- Modifying `neutralizeDisplayObject` (it already sets these flags).
- Changing `safeDestroyChildren` (it delegates to `safeDestroyDisplayObject`).
- Rewriting `safe-destroy.ts` or `text-runtime.ts` without a newly discovered architectural problem.

## Acceptance Criteria

### Tests That Must Pass

1. **safe-destroy: pre-destroy flags**: The existing test continues to prove a mock display object's `renderable` and `visible` are `false` before `destroy()` is called.
2. **safe-destroy: fallback still works**: The existing catch-path neutralization behavior remains covered and passing.
3. **text-runtime: pre-destroy flags**: `destroyManagedText` is proven to set `renderable = false` and `visible = false` before the destroy path begins.
4. **text-runtime: destroy-time flags**: If not already covered, add a test proving `Text.destroy()` itself observes the flags as `false`.
5. `pnpm -F @ludoforge/runner test` passes.
6. `pnpm -F @ludoforge/runner typecheck` passes.
7. `pnpm -F @ludoforge/runner lint` passes.

### Invariants

1. `safeDestroyDisplayObject` sets `renderable = false` and `visible = false` before calling `destroy()`.
2. `destroyManagedText` reaches both `removeFromParent()` and `destroy()` with rendering flags already disabled.
3. No new production abstractions are introduced unless a genuine design flaw is found.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/text-runtime.test.ts` — Add a destroy-time ordering assertion only if the current suite does not already prove it.

### Commands

1. `pnpm -F @ludoforge/runner test -- safe-destroy`
2. `pnpm -F @ludoforge/runner test -- text-runtime`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed: Reassessed the ticket against the live runner code and corrected its stale assumptions. The pre-destroy render guards were already implemented in `packages/runner/src/canvas/renderers/safe-destroy.ts` and `packages/runner/src/canvas/text/text-runtime.ts`, so no production changes were needed. Added one regression test in `packages/runner/test/canvas/text/text-runtime.test.ts` to prove that `destroyManagedText()` reaches `Text.destroy()` with `renderable = false` and `visible = false`.
- Deviations from original plan: The original ticket proposed source changes to `safe-destroy.ts` and `text-runtime.ts`. Reassessment showed those changes had already landed, so the justified scope narrowed to ticket correction, architecture review, verification, and one missing destroy-time ordering assertion.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- safe-destroy`
  - `pnpm -F @ludoforge/runner test -- text-runtime`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
