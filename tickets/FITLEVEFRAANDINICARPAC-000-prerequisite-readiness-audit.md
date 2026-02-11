# FITLEVEFRAANDINICARPAC-000 - Prerequisite Readiness Audit

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: Specs 16-19 implemented

## Goal
Verify prerequisite foundation capabilities from Specs 16-19 are present and stable before starting Spec 20 implementation tickets.

## Scope
- Audit repository for required capabilities:
  - map/state typing and validation,
  - turn sequence and event lifecycle windows,
  - operation/targeting primitives,
  - coup/scoring interactions events can mutate.
- Capture a short readiness checklist document and any blocking gaps.
- If gaps are found, open follow-up blocking tickets before proceeding with Spec 20 implementation.

## Implementation tasks
1. Map prerequisite capabilities to concrete modules/tests currently in repo.
2. Run focused regression test set for those capabilities.
3. Document pass/fail readiness and blockers.
4. Link readiness result from downstream Spec 20 tickets.

## File list it expects to touch
- `tickets/FITLEVEFRAANDINICARPAC-000-prerequisite-readiness-audit.md`
- `specs/20-fitl-event-framework-and-initial-card-pack.md` (only if adding checklist link/reference is needed)
- `specs/22-fitl-foundation-implementation-order.md` (only if sequencing note is needed)

## Out of scope
- Implementing new runtime/compiler features.
- Authoring event-card data for cards 82/27.
- Changing schemas/types unrelated to documenting readiness results.
- Archiving or status-changing other specs/tickets.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/integration/fitl-coin-operations.test.js`
- `node --test dist/test/integration/fitl-insurgent-operations.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`

### Invariants that must remain true
- Readiness gate is evidence-based and traceable to concrete modules/tests.
- No feature behavior changes occur as part of this audit ticket.
- Downstream Spec 20 tickets only proceed once blockers are either resolved or explicitly deferred.

