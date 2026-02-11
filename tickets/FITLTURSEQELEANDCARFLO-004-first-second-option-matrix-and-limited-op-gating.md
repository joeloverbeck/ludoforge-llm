# FITLTURSEQELEANDCARFLO-004 - First/Second Option Matrix and Limited Op Gating

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-003`

## Goal
Enforce the first/second eligible action matrix and Limited Operation gating rules as reusable runtime legality constraints configured from compiled sequencing data.

## Scope
- Implement matrix rules for second eligible faction based on first eligible action class:
  - first `Event` -> second `Operation` or `OperationPlusSpecialActivity`,
  - first `Operation` -> second `LimitedOperation` only,
  - first `OperationPlusSpecialActivity` -> second `LimitedOperation` or `Event`.
- Treat `LimitedOperation` as `Operation` for eligibility transition classification.
- Add Limited Operation structural legality checks:
  - one-space operation,
  - no Special Activity,
  - patrol/sweep/march multi-origin one-destination exception metadata.

## File list it expects to touch
- `src/kernel/legal-moves.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/types.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/apply-move.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/action-usage.test.ts` (new)
- `test/integration/fitl-option-matrix.test.ts` (new)

## Out of scope
- Pass reward math and replacement chain.
- Event-based eligibility override durations.
- Monsoon and pivotal timing windows.
- Operation payload resolution from Spec 18.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/action-usage.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`

## Invariants that must remain true
- Matrix legality is fully data-driven from compiled config.
- `LimitedOperation` is consistently classified for eligibility transitions.
- Deterministic legal-move ordering is preserved for identical states.
- No behavioral regression for existing non-FITL action legality suites.
