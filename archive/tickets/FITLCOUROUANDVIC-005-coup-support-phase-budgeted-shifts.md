# FITLCOUROUANDVIC-005 - Coup Support Phase Budgeted Shifts

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement Support phase behavior with deterministic shared budgets and per-space shift caps for US/ARVN Pacification and VC Agitation.

## Assumption Reassessment (2026-02-11)
- `chooseN` range cardinality (`max`/`min..max`) is already implemented in runtime and schema typing.
- Existing `effects-choice` and `effects-var` unit coverage already validates choice and var primitives needed by Support-phase scripts.
- `fitl-coup-support-phase` integration coverage does not exist yet and is the primary gap.
- No new kernel `types`/`schemas`/`eval-query`/`eval-value` API surface is required for this ticket's scope.
- Trace audit for this ticket will be validated via deterministic trigger log collection plus explicit audit vars in fixture state; no trace schema expansion is required here.

## Implementation Tasks
1. Add deterministic Support-phase integration fixture executing US then ARVN Pacification with one shared max-4-space budget.
2. Enforce per-space max-2-shift cap for Pacification and Agitation in fixture effects.
3. Enforce US spending restriction so ARVN resources never drop below `Total Econ` during US portion.
4. Implement VC Agitation in fixture effects with max-4-space budget and per-space cap.
5. Assert deterministic audit outputs (shift counters/budgets and trigger-log evidence) in integration tests.

## File List Expected To Touch
- `tickets/FITLCOUROUANDVIC-005-coup-support-phase-budgeted-shifts.md`
- `test/integration/fitl-coup-support-phase.test.ts` (new)

## Out Of Scope
- Resources phase earnings and aid/casualty coupling.
- Redeploy/commitment/reset behavior.
- Victory threshold or final margin ranking logic.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/effects-choice.test.js`
- `node --test dist/test/unit/effects-var.test.js`
- `node --test dist/test/integration/fitl-coup-support-phase.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Shared/support-phase budgets are deterministic and cannot overspend.
- Per-space shift cap (`<=2`) is always enforced.
- ARVN resources never cross below `Total Econ` due to Support-phase spending.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added `test/integration/fitl-coup-support-phase.test.ts` with deterministic Support-phase fixture coverage for US->ARVN Pacification shared budgeting, per-space max-2 caps, US spending floor at `Total Econ`, VC Agitation max-4-space budgeting, and determinism.
  - Reassessed and corrected ticket assumptions/scope to reflect already-implemented runtime/schema support (`chooseN` range cardinality and existing unit coverage).
- **Deviation from original plan**:
  - No kernel runtime/schema source edits were required; behavior was satisfiable with existing generic primitives plus integration coverage.
  - Trace audit was validated through deterministic trigger-log assertions and audit state variables in fixture state instead of adding new trace schema fields.
- **Verification results**:
  - `npm run build`
  - `node --test dist/test/unit/effects-choice.test.js`
  - `node --test dist/test/unit/effects-var.test.js`
  - `node --test dist/test/integration/fitl-coup-support-phase.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
