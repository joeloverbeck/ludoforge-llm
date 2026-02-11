# FITLTURSEQELEANDCARFLO-003 - Eligibility Baseline, Pass Chain, and Resource Rewards

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`, `FITLTURSEQELEANDCARFLO-002`

## Goal
Implement deterministic eligible-faction scanning and pass replacement semantics, including pass rewards and rightmost-pass early-end behavior, as generic sequencing primitives driven by compiled data.

## Scope
- Compute first/second eligible candidates from left-to-right card symbol order.
- Implement pass behavior:
  - passer remains eligible next card,
  - reward assignment by faction class,
  - replacement by next leftmost eligible faction,
  - rightmost-pass immediate card-end rule.
- Record trace diagnostics for candidate set and pass-chain transitions.

## File list it expects to touch
- `src/kernel/legal-moves.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/types.ts`
- `src/kernel/eval-context.ts`
- `src/sim/simulator.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/sim/simulator.test.ts`
- `test/integration/fitl-eligibility-pass-chain.test.ts` (new)

## Out of scope
- First/second option matrix gating after non-pass action.
- Limited Operation one-space constraints.
- Event override duration windows.
- Pivotal/monsoon restrictions.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/sim/simulator.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Candidate scanning and replacement order is deterministic left-to-right by configured symbol order.
- At most two non-pass executions occur per card.
- Pass reward logic is data-driven, not hardcoded to FITL faction ids.
- Non-FITL legal-move behavior remains unchanged.
