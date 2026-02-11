# FITLCOUROUANDVIC-003 - Coup Round Phase Machine and Branching Policy

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`, `FITLCOUROUANDVIC-002`

## Goal
Implement the currently actionable subset of Coup branching policy in runtime card-boundary flow: enforce declarative consecutive-Coup limits from generic `coupPlan` contracts with deterministic lifecycle traces.

## Assumption Reassessment (2026-02-11)
- Existing support already present:
  - Generic `coupPlan`/`victory` contracts, lowering, and structural validation were added in `FITLCOUROUANDVIC-001`.
  - Turn-flow lifecycle already emits deterministic trace-visible Coup boundary entries (`coupToLeader`, `coupHandoff`) in `advancePhase`/`applyTurnFlowCardBoundary`.
- Discrepancy found:
  - Runtime execution does not currently implement full Spec 19 Coup phase-machine semantics (6.1-6.6), final-round phase omission, or victory checkpoint evaluation through `coupPlan`/`victory`.
  - Current Coup boundary behavior always allows repeated `coupHandoff` events when consecutive Coup cards appear.
- Scope correction:
  - This ticket should not claim full Coup phase-machine execution in the current kernel architecture.
  - This ticket should deliver the concrete branching-policy gap now representable in current runtime flow: prevent more than `coupPlan.maxConsecutiveRounds` Coup handoffs in a row (with deterministic trace behavior), preserving generic engine behavior and public APIs.

## Implementation Tasks
1. Apply `coupPlan.maxConsecutiveRounds` at turn-flow card-boundary runtime so excess consecutive Coup cards do not trigger additional Coup handoff lifecycle events.
2. Keep lifecycle trace output deterministic and stable for both permitted and suppressed Coup boundaries.
3. Add targeted regression tests for consecutive-Coup suppression while preserving existing non-Coup and single-Coup behavior.

## File List Expected To Touch
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/phase-advance.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts`

## Out Of Scope
- Full Coup phase-machine execution of Spec 19 phases 6.1-6.6.
- Final-round commitment/reset omission logic.
- Victory checkpoint and final ranking/margin evaluation.
- Arithmetic details for resources/support/redeploy/commitment/reset effects.
- Event framework or card-specific behaviors from Spec 20.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Coup lifecycle ordering is deterministic and trace-stable.
- Consecutive-Coup limit behavior is data-defined via `coupPlan.maxConsecutiveRounds`, not title-hardcoded.
- Existing non-Coup turn progression behavior remains unchanged.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added generic runtime tracking for consecutive Coup boundaries in turn-flow runtime state (`consecutiveCoupRounds`) and schema.
  - Applied `coupPlan.maxConsecutiveRounds` to `applyTurnFlowCardBoundary` so excess consecutive Coup cards do not emit additional `coupToLeader`/`coupHandoff` lifecycle events.
  - Added regression coverage for consecutive-Coup suppression in:
    - `test/unit/phase-advance.test.ts`
    - `test/integration/fitl-card-lifecycle.test.ts`
- **Deviations from original plan**:
  - Original ticket language referenced full Coup phase-machine sequencing and final-round omission behavior, which are not represented in current runtime architecture; delivered scope was narrowed to the concrete branching-policy gap currently supported by the engine.
  - `src/kernel/legal-moves.ts` and broad golden tests were not changed because no move-legality or full-turn-flow fixture updates were required for this focused invariant.
- **Verification results**:
  - `npm run build`
  - `node --test dist/test/unit/phase-advance.test.js dist/test/integration/fitl-card-lifecycle.test.js dist/test/unit/initial-state.test.js dist/test/unit/schemas-top-level.test.js dist/test/unit/no-hardcoded-fitl-audit.test.js`
