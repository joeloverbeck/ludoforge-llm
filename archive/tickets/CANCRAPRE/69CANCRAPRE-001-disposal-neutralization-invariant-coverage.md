# 69CANCRAPRE-001: Disposal Neutralization Invariant Coverage

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: Spec 68 (completed), Spec 69

## Problem

Spec 69 currently treats a descendant-neutralization gap as the proven root cause of the remaining PixiJS crash. The current runner code does not support that conclusion strongly enough:
- `neutralizeDisplayObject()` already detaches the root container from its parent immediately.
- Existing disposal-queue tests already prove the detached subtree remains intact until deferred destroy.
- The production log shows `Text.collectRenderablesSimple` in the stack, but does not identify a reproducible path showing that detached descendants remain reachable from the active stage tree.

Shipping a Pixi-private heuristic such as probing `_text` would make the architecture more brittle without first proving that the current invariants are insufficient.

## Assumption Reassessment (2026-03-20)

1. `neutralizeDisplayObject()` in `safe-destroy.ts` detaches the passed display object from its parent immediately, then sets `visible=false`, `renderable=false`, `eventMode='none'`, and `interactiveChildren=false`. It does not recurse. **Confirmed**.
2. `disposal-queue.ts:enqueue()` calls `neutralizeDisplayObject(container)` before the deferred destroy path. **Confirmed**.
3. Existing disposal-queue coverage already proves children remain attached to the detached subtree until flush. **Confirmed**.
4. The production log proves `Text.collectRenderablesSimple` is involved in the crash path, but does not prove that recursive descendant neutralization or Text-only detachment is the correct fix. **Confirmed discrepancy**.
5. Detecting Text nodes via `_text` would rely on Pixi internals rather than a stable public contract. **Architecturally rejected**.

## Architecture Check

1. The current architecture already uses the correct generic neutralization primitive: detach the subtree root immediately and defer actual destroy.
2. Before changing production code, we should codify the disposal invariants the renderer depends on and verify the current neutralization behavior under deeper subtree shapes.
3. This ticket is therefore test-focused. It deliberately avoids speculative production changes built on Pixi private fields.

## What to Change

### 1. Strengthen disposal invariant coverage

Add or strengthen tests that lock the current disposal contract:
- the root container is detached from the active parent tree immediately
- root neutralization never calls `destroy()`
- descendants remain attached to the detached subtree until deferred flush
- deep descendant trees do not leak back into the active parent tree after neutralization

## Files to Touch

- `packages/runner/test/canvas/renderers/safe-destroy.test.ts` (modify)
- `packages/runner/test/canvas/renderers/disposal-queue.test.ts` (modify)

## Out of Scope

- `safe-destroy.ts` production changes
- `disposal-queue.ts` production changes
- Any Text-specific detachment heuristic
- Any Pixi private-property detection
- Ticker error fence changes (ticket 002)
- Crash recovery changes (tickets 003, 004)
- Any engine package files

## Acceptance Criteria

### Tests That Must Pass

1. `neutralizeDisplayObject()` detaches the root container immediately and never calls `destroy()`.
2. Neutralization keeps descendants attached to the detached subtree until deferred flush.
3. Deeply nested subtrees remain detached from the original live parent tree after neutralization.
4. Disposal queue flush still destroys the enqueued subtree with `{ children: true }`.
5. Existing `safe-destroy` and `disposal-queue` suites continue to pass.
6. Targeted test commands use package-relative Vitest paths, not repo-root paths.

### Invariants

1. `neutralizeDisplayObject()` must never call `destroy()` on any object.
2. Descendants must remain attached to the detached subtree after neutralization so deferred destroy still owns the whole subtree.
3. This ticket does not introduce Pixi-internal special cases.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/safe-destroy.test.ts` — add explicit neutralization invariant cases.
2. `packages/runner/test/canvas/renderers/disposal-queue.test.ts` — add deep-subtree disposal coverage.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/safe-destroy.test.ts test/canvas/renderers/disposal-queue.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - corrected the ticket scope away from speculative Pixi-private `_text` probing
  - added disposal invariant coverage in `safe-destroy.test.ts` and `disposal-queue.test.ts`
- Deviations from original plan:
  - no production code change was made because the codebase already detaches the subtree root immediately and the original descendant-neutralization theory was not proven by the current evidence
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/safe-destroy.test.ts test/canvas/renderers/disposal-queue.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
