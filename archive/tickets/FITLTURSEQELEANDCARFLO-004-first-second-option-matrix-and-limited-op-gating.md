# FITLTURSEQELEANDCARFLO-004 - First/Second Option Matrix and Limited Op Gating

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-003`

## Goal
Enforce the first/second eligible action matrix and Limited Operation gating rules as reusable runtime legality constraints configured from compiled sequencing data.

## Reassessed assumptions
- `FITLTURSEQELEANDCARFLO-003` already implemented:
  - deterministic candidate scan/pass-chain state,
  - two-non-pass card-end reset,
  - turn-flow candidate gating in `legalMoves`.
- The current codebase does **not** yet have per-action turn-flow class metadata in `ActionDef`; turn-flow class identification is not compiler-lowered from `GameSpecDoc` action payload.
- The current codebase does **not** yet include operation payload schema (spaces/origins/destination/special-activity structure) needed for full Limited Operation structural legality checks described in Spec 17/Spec 18 boundary.
- Existing tests are centered in:
  - `test/unit/legal-moves.test.ts`,
  - `test/unit/apply-move.test.ts`,
  - `test/integration/fitl-eligibility-pass-chain.test.ts`,
  and there is no existing `test/unit/action-usage.test.ts`.

## Scope
- Implement matrix rules for second eligible faction based on first eligible non-pass action class:
  - first `Event` -> second `Operation` or `OperationPlusSpecialActivity`,
  - first `Operation` -> second `LimitedOperation` only,
  - first `OperationPlusSpecialActivity` -> second `LimitedOperation` or `Event`.
- Treat `LimitedOperation` as `Operation` for eligibility transition classification.
- Enforce matrix gating at `legalMoves` generation time so illegal second-faction options are never surfaced as legal moves.
- Persist first-action class in turn-flow runtime card state so pass-chain replacement after a first non-pass action still applies matrix gating deterministically.

## Deferred from this ticket (explicitly)
- Limited Operation structural payload legality checks (one-space/no-special-activity/multi-origin metadata) are deferred until Spec 18 operation payload representation exists in shared schemas and runtime.
- Compiler-lowered per-action class metadata for arbitrary action ids is deferred; this ticket uses canonical generic action ids (`event`, `operation`, `limitedOperation`, `operationPlusSpecialActivity`, `pass`) for class resolution.

## File list it expects to touch
- `src/kernel/legal-moves.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `test/unit/legal-moves.test.ts` (expanded)
- `test/integration/fitl-option-matrix.test.ts` (new)

## Out of scope
- Pass reward math and replacement chain.
- Event-based eligibility override durations.
- Monsoon and pivotal timing windows.
- Operation payload resolution from Spec 18 (including limited-op structural checks).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Matrix legality is fully data-driven from compiled config.
- `LimitedOperation` is consistently classified for eligibility transitions.
- Deterministic legal-move ordering is preserved for identical states.
- No behavioral regression for existing non-FITL action legality suites.

## Outcome
- **Completion date**: 2026-02-11
- **What was changed**:
  - Added runtime `turnFlow.currentCard.firstActionClass` tracking to preserve first-action class across pass-chain replacement within the same card.
  - Implemented legal-move option-matrix gating for second-eligible execution windows using `turnFlow.optionMatrix`.
  - Implemented `LimitedOperation` -> `operation` normalization for first-action matrix classification.
  - Added/expanded tests for matrix gating behavior:
    - unit coverage in `test/unit/legal-moves.test.ts`,
    - integration coverage in `test/integration/fitl-option-matrix.test.ts`.
- **What changed vs originally planned**:
  - Kept the deferred scope explicit: full Limited Operation structural payload checks remain deferred to Spec 18 payload modeling.
  - Removed planned changes to `src/kernel/action-usage.ts` and `src/kernel/diagnostics.ts` because the implemented fix did not require them.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/legal-moves.test.js` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/integration/fitl-option-matrix.test.js` passed.
  - `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js` passed.
  - `npm test` passed.
