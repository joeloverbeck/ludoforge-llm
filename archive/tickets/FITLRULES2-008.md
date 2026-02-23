# FITLRULES2-008: Production Runtime Option-Matrix Enforcement Tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal-move action-class variant emission for option-matrix windows
**Deps**: FITLRULES2-007

## Problem

Current option-matrix tests cover synthetic defs well and check production matrix row presence, but do not yet assert production runtime second-eligible behavior across Rule 2.3.4 branches.
During reassessment, a deeper mismatch appeared: production FITL operation actions (`train`, `patrol`, etc.) are not themselves turn-flow classes, so matrix filtering requires explicit move `actionClass` variants. Those variants are not emitted for normal legal-move enumeration in second-eligible windows, so production runtime matrix enforcement is currently under-specified by tests and partially unrealized in behavior.

## Assumption Reassessment (2026-02-23)

1. Production FITL `turnFlow.optionMatrix` now contains the three Rule 2.3.4 rows.
2. Existing production compile assertions do not guarantee runtime legal-move gating behavior.
3. Discrepancy: runtime currently relies on move `actionClass` to enforce matrix rows, but production legal-move enumeration does not emit required second-eligible class variants (`limitedOperation` / `operationPlusSpecialActivity`) for non-event actions.
4. Scope correction: this ticket must include a small kernel change plus tests, not test-only hardening.

## Architecture Check

1. Runtime contract tests on production data reduce regression risk at the architecture boundary (data policy -> generic kernel behavior).
2. Emitting turn-flow action-class variants in matrix-constrained windows is cleaner than forcing game/UIs to inject hidden classifier metadata for legality to work.
3. This keeps engine logic agnostic: kernel enforces generic `turnFlow` policy, while game data remains declarative.
4. No compatibility shims or aliases: undefined/missing classifier behavior in constrained windows is replaced by explicit canonical move classes.

## What to Change

### 1. Expand production option-matrix integration tests

Add production runtime cases that assert second-eligible legal move classes exactly match matrix policy (+ `pass`) for first=`event`, `operation`, and `operationPlusSpecialActivity` branches.
Use controlled card-driven runtime snapshots to isolate matrix policy from unrelated operation decision-sequence satisfiability.

### 2. Add interrupt regression assertion

Keep/add a guard that interrupt-phase actions are not blocked by option-matrix filtering.

### 3. Emit action-class variants for matrix-constrained windows

In legal-move enumeration, when a card-driven second-eligible matrix row is active, emit non-event candidate moves with the row’s allowed operation classes as explicit `move.actionClass` variants before option-matrix filtering.
This makes runtime policy enforceable for production action IDs that are not themselves canonical turn-flow classes.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify, helper export for constrained second-eligible classes)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify, ensure explicit `move.actionClass` participates in class resolution)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify, if needed for regression lock)

## Out of Scope

- New FITL rules data changes.
- Non-turn-flow action semantics.
- UI/agent-specific move post-processing.

## Acceptance Criteria

### Tests That Must Pass

1. Production runtime (matrix snapshot): first=`event` => second allows only operation/op+SA (+pass).
2. Production runtime (matrix snapshot): first=`operation` => second allows only limitedOperation (+pass).
3. Production runtime (matrix snapshot): first=`operationPlusSpecialActivity` => second allows limitedOperation/event (+pass).
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint` passes.

### Invariants

1. Production runtime legal moves reflect declared option matrix exactly.
2. Interrupt-phase move legality does not depend on first/second eligible matrix state.
3. Matrix-constrained legality is enforceable without game-specific action IDs matching canonical class names.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-option-matrix.test.ts` — add production runtime branch assertions plus interrupt-phase bypass assertion.
2. `packages/engine/src/kernel/legal-moves*.ts` and `packages/engine/src/kernel/turn-flow-eligibility.ts` — add variant emission/classification support required for production runtime enforcement.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- What changed:
  - Added production runtime option-matrix integration assertions for all Rule 2.3.4 second-eligible branches (`first=event`, `first=operation`, `first=operationPlusSpecialActivity`).
  - Added interrupt-phase regression assertion proving option-matrix filtering is bypassed during interrupt phases.
  - Implemented kernel support so option-matrix-constrained second-eligible windows emit explicit action-class variants for non-event actions, enabling matrix enforcement for production action IDs that are not canonical class names.
  - Updated turn-flow class resolution to honor explicit `move.actionClass` before falling back to action ID.
- Deviations from original plan:
  - Ticket was revised from test-only to include a minimal kernel change, because reassessment found production runtime matrix enforcement depended on missing class-variant emission.
  - Interrupt regression coverage stayed in `fitl-option-matrix.test.ts`; `fitl-commitment-phase.test.ts` did not require modification.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (253/253).
  - `pnpm -F @ludoforge/engine lint` passed.
