# FITLTURSEQELEANDCARFLO-002 - Card Lifecycle Slots, Promotion, and Coup Handoff

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`

## Goal
Implement generic runtime support for one-card lookahead lifecycle: initial reveal, end-of-card promotion, next-card reveal, and coup-card handoff trigger points with trace visibility.

## Scope
- Add card lifecycle state transitions:
  - game start reveal into `played` and `lookahead`,
  - post-card promotion `lookahead -> played`,
  - reveal next lookahead,
  - coup-card boundary transition into `leader` slot plus handoff signal.
- Emit trace entries for before/after lifecycle slot ids and transition step.

## File list it expects to touch
- `src/kernel/initial-state.ts`
- `src/kernel/phase-advance.ts`
- `src/kernel/types.ts`
- `src/kernel/serde.ts`
- `src/sim/simulator.ts`
- `test/unit/initial-state.test.ts`
- `test/unit/phase-advance.test.ts`
- `test/unit/serde.test.ts`
- `test/integration/game-loop.test.ts`
- `test/integration/sim/simulator-golden.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts` (new)

## Out of scope
- Eligibility candidate computation.
- Pass/resource rewards.
- Limited Operation legality rules.
- Coup-round phase internals and scoring (Spec 19).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/initial-state.test.js`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/unit/serde.test.js`
- `node --test dist/test/integration/game-loop.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`

## Invariants that must remain true
- Exactly one lifecycle promotion/reveal step per completed played card.
- Lifecycle transitions are deterministic and trace-visible.
- Coup execution ownership stays split: Spec 17 triggers handoff, Spec 19 owns coup-round internals.
- No FITL-specific branch logic is introduced in generic transition code.
