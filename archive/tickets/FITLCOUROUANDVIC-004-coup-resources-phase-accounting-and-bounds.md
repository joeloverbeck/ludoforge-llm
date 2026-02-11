# FITLCOUROUANDVIC-004 - Coup Resources Phase Accounting and Bounds

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement the currently actionable Resources-phase accounting slice (Spec 19 rule 6.2 semantics) using existing generic kernel/effect primitives, with deterministic ordering and strict bounds/floors.

## Assumption Reassessment (2026-02-11)
- Existing support already present:
  - Generic arithmetic/value/query/effect primitives already support deterministic bounded accounting flows (`setVar`, `addVar`, `if`, `forEach`, `aggregate`, clamped variable bounds).
  - Turn-boundary card lifecycle and limited Coup metadata are already implemented from prior tickets (`FITLCOUROUANDVIC-001` to `FITLCOUROUANDVIC-003`).
- Discrepancy found:
  - Runtime does not currently execute `coupPlan.phases[*].steps` as an interpreted Coup phase machine. Resources-phase logic is not auto-driven from `coupPlan` step labels today.
  - Prior file/test assumptions expected broad kernel/schema surgery for this ticket, but the current gap is primarily missing regression coverage for deterministic resources-phase accounting behaviors representable with existing generic engine features.
- Scope correction:
  - This ticket should validate deterministic Resources-phase accounting and bounds behavior through targeted tests over current generic primitives.
  - This ticket should not claim implementation of a full Spec 19 Coup phase interpreter or step dispatcher.

## Implementation Tasks
1. Add an integration regression that models Resources-phase accounting via generic effects with deterministic ordering.
2. Cover sabotage placement exhaustion under bounded marker supply and deterministic target priority.
3. Cover trail degradation conditional update and coupled track/resource arithmetic (`Aid`, `Total Econ`, faction resources).
4. Cover casualties-to-aid penalty floor behavior (`Aid -= 3 * casualties`, floor `0`) via variable bounds.
5. Keep runtime/compiler APIs unchanged unless a concrete failing test requires a minimal fix.

## File List Expected To Touch
- `test/integration/fitl-coup-resources-phase.test.ts` (new)
- `tickets/FITLCOUROUANDVIC-004-coup-resources-phase-accounting-and-bounds.md`

## Out Of Scope
- Full Spec 19 Coup phase-machine runtime execution from `coupPlan` step labels.
- Support phase pacification/agitation budgets.
- Redeploy/commitment/reset phase execution.
- Final victory ranking/margin output.
- Any per-card event behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/integration/fitl-coup-resources-phase.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Resource, aid, patronage, and econ bounds stay within declared limits.
- Resources-phase deterministic loops terminate for the same state and inputs.
- No hidden runtime reads from `data/fitl/...` are introduced.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Reassessed and corrected ticket assumptions to match current runtime architecture (no interpreted `coupPlan` step execution yet).
  - Added `test/integration/fitl-coup-resources-phase.test.ts` with deterministic regression coverage for:
    - sabotage placement exhaustion ordering,
    - trail degradation conditional accounting,
    - ARVN/VC/NVA resource updates,
    - casualties-to-aid floor behavior.
  - Verified no public API changes were required.
- **Deviations from original plan**:
  - The original plan expected broad kernel/eval/schema implementation changes. Current engine primitives already supported the required accounting slice, so delivery was narrowed to ticket correction plus targeted regression coverage.
- **Verification results**:
  - `npm run build`
  - `node --test dist/test/integration/fitl-coup-resources-phase.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - `npm run test`
