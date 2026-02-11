# FITLTURSEQELEANDCARFLO-003 - Eligibility Baseline, Pass Chain, and Resource Rewards

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`, `FITLTURSEQELEANDCARFLO-002`

## Goal
Implement deterministic eligible-faction scanning and pass replacement semantics, including pass rewards and rightmost-pass early-end behavior, as generic sequencing primitives driven by compiled data.

## Reassessed assumptions
- `FITLTURSEQELEANDCARFLO-001` and `FITLTURSEQELEANDCARFLO-002` are already complete; turn-flow data contracts and card-lifecycle trace plumbing already exist.
- Current runtime has no eligibility/pass-chain runtime state in `GameState`; legal move generation does not yet consult turn-flow candidates.
- Existing turn-flow contract provides:
  - ordered faction ids (`turnFlow.eligibility.factions`),
  - pass reward entries (`turnFlow.passRewards`),
  - but no explicit faction-id-to-class mapping and no per-action class mapping.
- Therefore this ticket must establish a minimal generic baseline:
  - deterministic ordered candidate scanning and pass replacement chain state,
  - pass reward application via data lookups keyed by current acting faction id,
  - rightmost-pass early end behavior,
  - while deferring full option-matrix and duration-window semantics to tickets `004` and `005`.

## Scope
- Add generic runtime turn-flow state for:
  - eligibility order and per-faction eligibility flags,
  - first/second candidate slots,
  - card-local pass chain and non-pass execution count.
- Compute first/second eligible candidates from `turnFlow.eligibility.factions` deterministic left-to-right order.
- Implement pass behavior:
  - passer remains eligible for next-card baseline,
  - reward assignment using `turnFlow.passRewards` entries keyed by current faction id,
  - replacement by next leftmost currently eligible non-passed faction,
  - rightmost-pass immediate card-end rule.
- Record trace diagnostics for candidate scan and pass-chain transitions.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/turn-flow-lifecycle.ts` (trace entry union extension only if needed)
- `test/unit/legal-moves.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/initial-state.test.ts` (if runtime state initialization assertions are required)
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
- `node --test dist/test/unit/initial-state.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Candidate scanning and replacement order is deterministic left-to-right by configured symbol order.
- At most two non-pass executions occur per card.
- Pass reward logic is data-driven, not hardcoded to FITL faction ids.
- Non-FITL legal-move behavior remains unchanged.

## Outcome
- **Completion date**: 2026-02-11
- **What was changed**:
  - Added generic optional runtime `turnFlow` state on `GameState` to track ordered faction eligibility, first/second candidates, acted/passed chain, and per-card non-pass count.
  - Initialized turn-flow runtime state in `initialState` from `turnFlow.eligibility.factions` with deterministic first/second candidate scan.
  - Added post-move turn-flow transition handling:
    - pass-chain progression,
    - pass rewards from `turnFlow.passRewards`,
    - rightmost-pass immediate card-end reset,
    - two non-pass card-end reset.
  - Added new trace diagnostics (`turnFlowEligibility`) for candidate scan, pass chain, and card-end transitions.
  - Added/updated tests covering runtime initialization, legal-move gating by candidate slots, pass-chain rewards/reset, and two non-pass end-of-card behavior.
- **Deviations from original plan**:
  - Reward lookup was implemented by matching `passRewards.factionClass` to current acting faction id because the current contract does not yet include explicit faction-id-to-class mapping.
  - Scope remained intentionally short of option-matrix gating and duration-window overrides (owned by `004`/`005`).
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/legal-moves.test.js` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/unit/initial-state.test.js` passed.
  - `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js` passed.
  - `npm test` passed.
