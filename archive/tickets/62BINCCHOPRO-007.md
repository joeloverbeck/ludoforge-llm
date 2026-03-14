# 62BINCCHOPRO-007: Runner ChoicePanel incremental protocol verification and regression hardening

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: archive/tickets/62BINCCHOPRO-006.md, archive/tickets/62BINCCHOPRO-001.md

## Problem

This ticket originally assumed `packages/runner/src/ui/ChoicePanel.tsx` still owned local `chooseN` selection state and still submitted one atomic `chooseN(fullArray)` action. That assumption is no longer true.

The runner already uses the incremental `chooseN` architecture delivered in ticket `62BINCCHOPRO-006`:

- the store exposes `addChooseNItem(...)`, `removeChooseNItem(...)`, and `confirmChooseN()`
- the render model projects engine-owned `selected` / `canConfirm` state into `choiceUi.kind === 'discreteMany'`
- `ChoicePanel` dispatches incremental store actions instead of an atomic `chooseN(...)`

The remaining value of this ticket is therefore not implementation of the protocol itself. It is to verify that the current `ChoicePanel` architecture still honors engine-owned state as the only source of truth, and to harden regression coverage around that invariant.

## Assumption Reassessment (2026-03-14)

1. `ChoicePanel` is at `packages/runner/src/ui/ChoicePanel.tsx`. Confirmed.
2. The panel no longer owns local `chooseN` state. Confirmed discrepancy with the original ticket.
3. The panel no longer submits `chooseN(fullArray)`. Confirmed discrepancy with the original ticket.
4. The panel does not read raw `choicePending` directly. It consumes `renderModel.choiceUi`, which is a cleaner runner architecture than coupling the UI directly to engine protocol types. Confirmed.
5. `renderModel.choiceUi.kind === 'discreteMany'` already carries `selectedChoiceValueIds` and `canConfirm`, derived from engine-owned pending state. Confirmed.
6. The existing UI tests already cover incremental add/remove/confirm dispatch in broad strokes, but they do not directly pin the non-optimistic/no-local-state invariant strongly enough. Confirmed gap.

## Architecture Check

1. The current architecture is better than the original ticket proposal. `ChoicePanel` should continue to depend on runner render-model types, not raw engine `choicePending` payloads. That preserves a clean boundary between engine protocol, store orchestration, and presentational UI.
2. The authoritative multi-select state must remain engine-owned all the way through the store/render-model pipeline. The panel may derive display-only details, but it must not invent selected state or confirmation readiness locally.
3. No compatibility alias for atomic `chooseN(...)` should be reintroduced. The incremental action set is the correct long-term interface.

## What to Change

### 1. Correct this ticket's scope

Update the ticket to reflect that the incremental `ChoicePanel` architecture already exists and that this ticket is now verification/test-hardening work, not a fresh UI migration.

### 2. Strengthen UI regression coverage

Add or tighten tests that prove:

- `ChoicePanel` does not optimistically toggle `chooseN` selected state locally
- the confirm button obeys engine-provided `canConfirm`, even if selected-count math alone could suggest confirmation should be allowed

### 3. Re-verify the runner suite

Run the relevant runner checks so the archived ticket records verified reality instead of stale intent.

## Files to Touch

- `tickets/62BINCCHOPRO-007.md` (modify first — correct assumptions and scope)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify — add focused regression coverage if needed)

## Out of Scope

- Store action implementation already completed in ticket `62BINCCHOPRO-006`
- Worker/bridge implementation already completed in ticket `62BINCCHOPRO-005`
- Engine kernel changes from tickets `62BINCCHOPRO-001` through `62BINCCHOPRO-004`
- Rewiring `ChoicePanel` to consume raw `choicePending`; that would be a step backward architecturally
- Visual redesign or unrelated accessibility work

## Acceptance Criteria

### Tests That Must Pass

1. `ChoicePanel` multi-select mode still dispatches `addChooseNItem(...)`, `removeChooseNItem(...)`, and `confirmChooseN()` incrementally
2. `ChoicePanel` does not reflect new multi-select state until the store/render-model re-renders with updated engine-owned data
3. `ChoicePanel` uses `canConfirm` as authoritative confirmation state
4. `pnpm -F @ludoforge/runner typecheck` succeeds
5. `pnpm -F @ludoforge/runner test` succeeds
6. `pnpm -F @ludoforge/runner lint` succeeds

### Invariants

1. The panel never becomes the source of truth for `chooseN` selection state
2. The panel never recomputes authoritative confirm eligibility from local bounds/count state
3. The runner UI remains decoupled from raw engine protocol types via the render-model layer
4. No game-specific identifiers enter runner UI code

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ChoicePanel.test.ts` — focused regression tests for engine-owned selection/confirm state

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-14
- What actually changed:
  - Reassessed the ticket against the live runner code and corrected its assumptions and scope.
  - Confirmed the incremental `chooseN` `ChoicePanel` architecture was already implemented through the store and render-model pipeline.
  - Added focused `ChoicePanel` regression tests to lock in two architectural invariants: no local optimistic multi-select state, and engine-owned `canConfirm` remains authoritative.
- Deviations from original plan:
  - No production runner code changes were needed. The original ticket was stale and would have duplicated or partially undone work already completed in ticket `62BINCCHOPRO-006`.
  - The original ticket proposed thinking in terms of raw `choicePending` ownership inside the panel. The current architecture, where the panel consumes runner render-model state instead, is cleaner and remains the preferred long-term boundary.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test -- ChoicePanel` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
