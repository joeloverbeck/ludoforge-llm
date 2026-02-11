# FITLCOUROUANDVIC-006 - Coup Redeploy/Commitment/Reset Phase Effects

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement the currently actionable deterministic Redeploy/Commitment/Reset semantics slice for Spec 19 via existing generic phase triggers/effects, including declared recomputation checkpoints and non-final/final guard behavior.

## Assumption Reassessment (2026-02-11)
- Existing support already present:
  - Generic effect/runtime primitives already support deterministic phase-enter scripts required for this slice (`if`, `forEach`, `moveAll`, `moveToken`, `setVar`, `addVar`, bounded vars, zone-count recomputation).
  - Turn-flow lifecycle already advances card state deterministically at turn boundary and emits stable lifecycle trace entries from prior tickets.
- Discrepancies found:
  - Runtime does not currently execute `coupPlan.phases[*].steps` as an interpreted Coup phase machine.
  - `coupPlan.finalRoundOmitPhases` is validated structurally but not executed as runtime phase-skipping logic.
  - The originally listed `test/unit/turn-flow-eligibility.test.ts` and broad kernel/schema surgery are not required for this ticket's actionable slice.
- Scope correction:
  - This ticket should validate deterministic Redeploy/Commitment/Reset behavior representable today through generic phase-enter effects in fixture coverage.
  - This ticket should not claim full runtime implementation of Spec 19 coup-plan step interpretation or declarative phase omission execution.

## Implementation Tasks
1. Add a deterministic integration fixture covering Redeploy effects: forced Laos/Cambodia COIN removal behavior and declared control recomputation checkpoint.
2. Add non-final Commitment coverage for casualty movement bounds and control recomputation checkpoint.
3. Add non-final Reset coverage for trail normalization edge rule, terror/sabotage clear, guerrilla/SF underground flips, momentum discard, and reset audit markers.
4. Add final-round guard coverage demonstrating commitment/reset effects are skipped when fixture policy indicates final Coup.
5. Keep runtime/compiler public APIs unchanged unless a concrete failing test requires a minimal fix.

## File List Expected To Touch
- `tickets/FITLCOUROUANDVIC-006-coup-redeploy-commitment-reset-phase-effects.md`
- `test/integration/fitl-coup-redeploy-commit-reset.test.ts` (new)

## Out Of Scope
- Full Spec 19 coup-plan step interpreter in runtime.
- Runtime execution of `coupPlan.finalRoundOmitPhases` as phase-skipping policy.
- Resources/support arithmetic already covered by prior tickets.
- Victory threshold/final ranking output.
- Event framework/card-specific behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/integration/fitl-coup-redeploy-commit-reset.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Redeploy/Commitment/Reset checkpoint effects are deterministic for identical seeds and inputs.
- Final/non-final gating is data-driven by fixture policy and does not require FITL-specific runtime branching.
- Turn-flow lifecycle and eligibility state remain in a valid baseline after reset/turn boundary advancement.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Reassessed and corrected ticket assumptions/scope to match current runtime architecture (no interpreted `coupPlan.phases[*].steps` execution yet).
  - Added `test/integration/fitl-coup-redeploy-commit-reset.test.ts` with deterministic integration coverage for:
    - Redeploy forced Laos/Cambodia COIN removal and redeploy control-checkpoint recompute audit.
    - Non-final Commitment casualty transition and control-checkpoint recompute audit.
    - Non-final Reset trail normalization (0->1 and 4->3 edge behavior via guarded logic), terror/sabotage clear, guerrilla/SF underground flips, momentum discard, and baseline-reset audit marker.
    - Final-round fixture-policy guard that skips commitment/reset effects.
    - Turn-boundary lifecycle/eligibility baseline assertions after reset.
- **Deviation from original plan**:
  - No kernel runtime/schema/public API changes were required; the actionable scope is fully representable with existing generic primitives and targeted regression coverage.
  - `test/unit/turn-flow-eligibility.test.ts` and broad kernel file edits were removed from expected scope because they do not exist/are not necessary for this ticket.
- **Verification results**:
  - `npm run build`
  - `node --test dist/test/integration/fitl-coup-redeploy-commit-reset.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - `node --test dist/test/unit/phase-advance.test.js`
