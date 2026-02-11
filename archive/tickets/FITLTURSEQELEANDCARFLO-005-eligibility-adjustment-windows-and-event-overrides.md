# FITLTURSEQELEANDCARFLO-005 - Eligibility Adjustment Windows and Event Overrides

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-004`

## Goal
Implement post-card eligibility adjustment semantics with explicit duration windows, including event-based overrides and free-operation exception handling.

## Reassessed assumptions (2026-02-11)
- Primary runtime ownership is in `src/kernel/turn-flow-eligibility.ts` (not `src/kernel/effects.ts` / `src/kernel/effect-context.ts`).
- `overrideWindows`/`durationWindows` are already compiled and schema-validated, but runtime does not yet apply default post-card eligibility writes.
- Existing FITL integration coverage uses `test/integration/fitl-eligibility-pass-chain.test.ts`; `fitl-eligibility-window` does not exist yet.
- Full multi-window expiration hooks (`coup`/`campaign`) are not wired in runtime card lifecycle state for this ticket and are deferred.

## Scope
- Apply default post-card eligibility adjustment:
  - factions executing `Operation`/`LimitedOperation`/`Event` become ineligible next card,
  - non-executing factions remain eligible.
- Support data-defined eligibility overrides with explicit duration metadata for the `nextCard` window in this ticket.
- Enforce free-operation exception semantics so non-executing factions are not incorrectly reclassified.
- Emit trace-visible eligibility adjustment details and override lifecycle (creation/consumption for `nextCard`).

## File list it expects to touch
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-eligibility-window.test.ts` (new)
- `test/integration/fitl-eligibility-pass-chain.test.ts`

## Out of scope
- Pivotal trump precedence and cancellation sequencing.
- Monsoon action restrictions.
- Coup-round execution details.
- Event-card payload authoring (Spec 20).
- Non-`nextCard` override expiration windows (`coup`/`campaign`) and their lifecycle triggers.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Every applied override has an explicit declared window type from `turnFlow.eligibility.overrideWindows`.
- Default and override eligibility adjustments are trace-visible at card end.
- Free-op exception never mutates eligibility for non-executing factions.
- Runtime behavior added here remains generic/non-FITL and does not hardcode FITL identifiers.

## Outcome
- Completed: 2026-02-11
- Actually changed:
  - Implemented post-card default eligibility writes in `turn-flow-eligibility` so executing non-pass factions become ineligible on the next card.
  - Added generic `nextCard` override directive ingestion (`eligibilityOverride:<faction|self>:<eligible|ineligible>:<windowId>`) validated against declared `overrideWindows`.
  - Added trace visibility for card-end eligibility before/after plus override creation/consumption.
  - Added new integration coverage in `test/integration/fitl-eligibility-window.test.ts`.
  - Updated existing eligibility pass-chain integration and unit coverage in `test/unit/apply-move.test.ts` to assert corrected next-card eligibility behavior.
- Deviations from original plan:
  - Deferred non-`nextCard` override lifecycle windows (`coup`/`campaign`) because runtime trigger hooks for those expirations are not yet present in this ticket scope.
  - No changes were needed in `apply-move`, `effects`, or trigger dispatch modules after reassessment.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/apply-move.test.js`
  - `node --test dist/test/unit/legal-moves.test.js`
  - `node --test dist/test/integration/fitl-eligibility-window.test.js`
  - `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`
  - `npm test`
