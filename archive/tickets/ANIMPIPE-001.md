# ANIMPIPE-001: Safe container destruction

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`Container.destroy()` can throw (PixiJS v8 `TexturePoolClass.returnTexture` failure path), and unhandled exceptions in renderer cleanup can break animation processing.

## Assumption Reassessment (2026-02-21)

1. `token-renderer.ts` has two cleanup call sites where token containers are removed and destroyed — confirmed.
2. A dedicated safe-destroy utility already exists at `packages/runner/src/canvas/renderers/safe-destroy.ts` — this contradicts the original ticket assumption that it did not exist.
3. Runner tests for both utility and token-renderer fallback behavior already exist:
   - `packages/runner/test/canvas/renderers/safe-destroy.test.ts`
   - `packages/runner/test/canvas/renderers/token-renderer.test.ts` (`completes update cycle even when container.destroy() throws`)

## Scope Correction

The originally proposed implementation has already been completed in code.

Updated scope for this ticket:
1. Verify implementation still matches intended architecture.
2. Re-run relevant tests and quality gates.
3. Close and archive the ticket.

## Architecture Reassessment

1. The current `safeDestroyContainer` utility is preferable to direct per-renderer `destroy()` calls because it centralizes failure handling and keeps renderers focused on rendering concerns.
2. The change is isolated to runner rendering internals and does not couple engine/runtime contracts to PixiJS behavior.
3. No compatibility aliasing is required; direct `destroy()` usage has been replaced in the affected token renderer cleanup path.

## Files Verified

- `packages/runner/src/canvas/renderers/safe-destroy.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/test/canvas/renderers/safe-destroy.test.ts`
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`

## Acceptance Criteria Verification

1. Safe destroy calls `container.destroy()` when no error occurs — covered and passing.
2. Safe destroy catches destroy errors and does not rethrow — covered and passing.
3. Safe destroy falls back to `removeFromParent()` and logs warning — covered and passing.
4. Token renderer update continues even when destroy throws — covered and passing.

## Validation Commands Run

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-21
- Originally planned: add safe-destroy utility, wire token renderer, add tests.
- Actually changed: implementation and tests were already present; ticket was corrected to reflect real repository state and validated against current test/lint/typecheck gates.
- Deviation: to satisfy current lint gate, one unrelated pre-existing lint issue was fixed in `packages/runner/src/canvas/GameCanvas.tsx` (`let` → `const` for `canvasReady`).
- Verification results: runner tests, runner typecheck, and runner lint all pass.
