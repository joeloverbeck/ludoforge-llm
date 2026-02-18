# AGNOSTIC-008: De-duplicate Pointer Hover Dispatch in Canvas Interaction Handlers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## Reassessed Assumptions (2026-02-18)

1. `attachZoneSelectHandlers` and `attachTokenSelectHandlers` currently bind multiple hover-enter/leave events (`pointerover` + `pointerenter` + `mouseover`; `pointerout` + `pointerleave` + `mouseout`), so one logical transition can emit repeated callbacks.
2. Hover target publication is already centralized in `createHoverTargetController` using an `activeTargets` map keyed by target identity, which reduces downstream tooltip churn but does not prevent redundant upstream callback traffic.
3. Existing tests currently verify basic hover callback wiring, but they do not enforce a strict single-dispatch invariant under duplicated/burst hover event sequences.
4. Canvas-level hover anchor cadence is already covered in `packages/runner/test/canvas/GameCanvas.test.ts`; adding UI-level tooltip tests for this specific regression is unnecessary duplication unless a UI bug is observed.

## What Needs to Change

1. Refactor zone/token hover registration to a single canonical hover event pair and enforce one enter/leave callback per logical transition.
2. Add local hover-state guards in both interaction handlers so duplicate enter/leave events cannot re-emit callbacks.
3. Preserve selection behavior invariants (click dispatch, drag-intent suppression, token `stopPropagation`) and pointer-based cross-input compatibility.
4. Validate that existing canvas-level hover anchor cadence tests still pass unchanged.

## Invariants

1. Hover enter and leave callbacks fire once per logical transition.
2. Zone/token selection click behavior remains unchanged.
3. Drag-intent suppression behavior for selection remains unchanged.
4. Token `pointerup` continues to call `stopPropagation`.
5. Tooltip anchor publication cadence remains stable under pan/zoom and overlap transitions.

## Tests That Should Pass

1. `packages/runner/test/canvas/interactions/zone-select.test.ts`
   - Update listener registration expectations to match canonical hover bindings.
   - Add regression coverage for exactly one enter/leave callback per logical transition under duplicate event emission.
2. `packages/runner/test/canvas/interactions/token-select.test.ts`
   - Add/verify symmetric single-dispatch behavior for tokens and listener cleanup parity with zone handlers.
3. `packages/runner/test/canvas/GameCanvas.test.ts`
   - Keep existing hover anchor cadence tests green as architecture-level regression coverage.
4. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Removed redundant hover event bindings from zone/token handlers; canonicalized to `pointerenter`/`pointerleave`.
  - Added per-handler `hoverActive` guards so duplicated enter/leave events do not re-emit hover callbacks.
  - Kept existing selection invariants intact (`dragIntent`, click dispatch, token `stopPropagation`).
  - Strengthened interaction tests to assert canonical listener wiring and single-dispatch behavior under duplicate event emission.
- **Deviations from original plan**:
  - Replaced planned tooltip-layer regression test with existing canvas-level hover-anchor cadence coverage (`GameCanvas.test.ts`), which already validates the architecture boundary where hover state is published.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
