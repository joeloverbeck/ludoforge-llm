# FITLEVEFRAANDINICARPAC-000 - Prerequisite Readiness Audit

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `archive/specs/16-fitl-map-scenario-and-state-model.md`, `archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`, `archive/specs/18-fitl-operations-and-special-activities.md`, `archive/specs/19-fitl-coup-round-and-victory.md`

## Goal
Verify prerequisite foundation capabilities from Specs 16-19 are present and stable before starting Spec 20 implementation tickets.

## Assumption Reassessment (vs original ticket)
- Confirmed accurate: prerequisite Specs 16-19 are implemented and archived under `archive/specs/`.
- Corrected: readiness evidence can be captured in this ticket directly; no additional checklist document is required.
- Corrected: no updates to `specs/20-fitl-event-framework-and-initial-card-pack.md` or `specs/22-fitl-foundation-implementation-order.md` were needed because references were already consistent.
- Corrected for closure workflow: archival/status update of this ticket is included in completion scope.

## Scope
- Audit repository for required capabilities:
  - map/state typing and validation,
  - turn sequence and event lifecycle windows,
  - operation/targeting primitives,
  - coup/scoring interactions events can mutate.
- Capture readiness checklist and blocking gaps directly in this ticket.
- If gaps are found, open follow-up blocking tickets before proceeding with Spec 20 implementation.

## Implementation tasks
1. Map prerequisite capabilities to concrete modules/tests currently in repo.
2. Run focused regression test set for those capabilities.
3. Document pass/fail readiness and blockers.
4. Archive this completed readiness ticket.

## Readiness Checklist
1. Map/state typing and validation: PASS  
Evidence:
- `src/kernel/map-model.ts`
- `src/kernel/data-assets.ts`
- `src/cnl/compiler.ts`
- `test/integration/fitl-card-lifecycle.test.ts`

2. Turn sequence and event lifecycle windows: PASS  
Evidence:
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/legal-moves.ts`
- `test/integration/fitl-card-lifecycle.test.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-turn-flow-golden.test.ts`

3. Operation/targeting primitives: PASS  
Evidence:
- `src/kernel/legal-moves.ts`
- `src/kernel/resolve-selectors.ts`
- `src/kernel/eval-query.ts`
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`

4. Coup/scoring interactions events can mutate: PASS  
Evidence:
- `src/cnl/compiler.ts` (`lowerCoupPlan`, `lowerVictory`)
- `src/kernel/turn-flow-lifecycle.ts`
- `test/integration/fitl-coup-victory.test.ts`

## Blockers
- None.

## Verification
Required regression set:
- `npm run build` - PASS
- `node --test dist/test/integration/fitl-card-lifecycle.test.js` - PASS
- `node --test dist/test/integration/fitl-coin-operations.test.js` - PASS
- `node --test dist/test/integration/fitl-insurgent-operations.test.js` - PASS
- `node --test dist/test/integration/fitl-coup-victory.test.js` - PASS

Additional hardening tests:
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js` - PASS
- `node --test dist/test/integration/fitl-eligibility-window.test.js` - PASS

## Out of scope
- Implementing new runtime/compiler features.
- Authoring event-card data for cards 82/27.
- Changing schemas/types unrelated to documenting readiness results.

## Acceptance criteria
### Invariants that must remain true
- Readiness gate is evidence-based and traceable to concrete modules/tests.
- No feature behavior changes occur as part of this audit ticket.
- Downstream Spec 20 tickets only proceed once blockers are either resolved or explicitly deferred.

## Outcome
- Completion date: 2026-02-11.
- Actually changed:
  - Reassessed and corrected ticket assumptions/scope to match repository reality.
  - Added concrete readiness checklist with module/test traceability.
  - Executed and recorded required regression tests plus two additional turn-flow/eligibility hardening tests.
  - No runtime/compiler/schema code changes were required.
- Deviations from original plan:
  - No spec file edits were needed.
  - No blocking follow-up tickets were opened because no gaps were found.
- Verification result:
  - All required and additional targeted tests passed.
