# FITLTURSEQELEANDCARFLO-005 - Eligibility Adjustment Windows and Event Overrides

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-004`

## Goal
Implement post-card eligibility adjustment semantics with explicit duration windows, including event-based overrides and free-operation exception handling.

## Scope
- Apply default post-card eligibility adjustment:
  - factions executing `Operation`/`LimitedOperation`/`Event` become ineligible next card,
  - non-executing factions remain eligible.
- Support data-defined eligibility overrides with explicit duration metadata and expiration triggers.
- Enforce free-operation exception semantics so non-executing factions are not incorrectly reclassified.
- Emit trace entries for override creation and expiration.

## File list it expects to touch
- `src/kernel/apply-move.ts`
- `src/kernel/effects.ts`
- `src/kernel/effect-context.ts`
- `src/kernel/types.ts`
- `src/kernel/trigger-dispatch.ts`
- `src/sim/delta.ts`
- `test/unit/effects-lifecycle.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/trigger-dispatch.test.ts`
- `test/integration/fitl-eligibility-window.test.ts` (new)

## Out of scope
- Pivotal trump precedence and cancellation sequencing.
- Monsoon action restrictions.
- Coup-round execution details.
- Event-card payload authoring (Spec 20).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/effects-lifecycle.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/trigger-dispatch.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`

## Invariants that must remain true
- Every override has explicit window type and deterministic expiration event.
- Default and override eligibility adjustments are trace-visible.
- Free-op exception never mutates eligibility for non-executing factions.
- Window semantics remain generic (card/next-card/coup/campaign) and non-FITL reusable.
