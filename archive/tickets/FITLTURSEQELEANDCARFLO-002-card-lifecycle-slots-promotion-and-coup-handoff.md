# FITLTURSEQELEANDCARFLO-002 - Card Lifecycle Slots, Promotion, and Coup Handoff

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`

## Goal
Implement generic runtime support for one-card lookahead lifecycle: initial reveal, end-of-card promotion, next-card reveal, and coup-card handoff trigger points with trace visibility.

## Reassessed assumptions
- `FITLTURSEQELEANDCARFLO-001` introduced `turnFlow` as a data contract only; no runtime lifecycle execution exists yet in `initial-state` or `phase-advance`.
- Lifecycle transitions are not currently represented in traces; `triggerFirings` only capture fired/truncated trigger dispatches.
- `turnFlow.cardLifecycle` currently provides only slot ids (`played`, `lookahead`, `leader`). There is no explicit draw-pile id in the contract; runtime must therefore use deterministic generic inference for reveal source without FITL-specific hardcoding.
- The original test/file list referenced a missing test file (`test/integration/fitl-card-lifecycle.test.ts`) and omitted `apply-move` integration points required for trace visibility.

## Scope
- Add generic lifecycle state transitions:
  - game start reveal into `played` and `lookahead`,
  - post-card promotion `lookahead -> played`,
  - reveal next lookahead from inferred draw pile,
  - coup-card boundary transition into `leader` slot plus handoff signal.
- Emit lifecycle trace entries with transition step and before/after slot card ids.
- Keep contracts generic and non-FITL-specific; do not require runtime reads from `data/<game>/...`.

## File list it expects to touch
- `src/kernel/initial-state.ts`
- `src/kernel/phase-advance.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts` (only if serialization shape updates require explicit handling)
- `test/unit/initial-state.test.ts`
- `test/unit/phase-advance.test.ts`
- `test/unit/serde.test.ts` (only if serialization shape updates require explicit assertions)
- `test/integration/game-loop.test.ts`
- `test/integration/sim/simulator-golden.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts` (new)

## Out of scope
- Eligibility candidate computation.
- Pass/resource rewards.
- Limited Operation legality rules.
- Coup-round phase internals and scoring (Spec 19).
- Expanding `turnFlow` schema with additional FITL-specific fields.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/initial-state.test.js`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/unit/serde.test.js`
- `node --test dist/test/integration/game-loop.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/integration/sim/simulator-golden.test.js`

## Invariants that must remain true
- Exactly one lifecycle promotion/reveal step per completed played card.
- Lifecycle transitions are deterministic and trace-visible.
- Coup execution ownership stays split: Spec 17 triggers handoff, Spec 19 owns coup-round internals.
- No FITL-specific branch logic is introduced in generic transition code.

## Outcome
- **Completion date**: 2026-02-11
- **What was changed**:
  - Added generic runtime lifecycle execution in kernel for:
    - initial reveal (`deck -> played`, `deck -> lookahead`) from inferred draw pile,
    - card-boundary progression (`played discard`, `lookahead -> played`, `deck -> lookahead`),
    - coup-card transfer (`played -> leader`) and explicit handoff lifecycle signal.
  - Added deterministic lifecycle trace entries in `triggerFirings` via a new generic `turnFlowLifecycle` log entry kind with `step` + before/after slot card ids.
  - Wired lifecycle execution into `initialState`, turn-boundary phase advancement, and `applyMove` trace collection.
  - Added/updated unit and integration tests for startup reveal, promotion/coup boundary behavior, and serialized trace round-trip coverage with lifecycle entries.
- **Deviations from original plan**:
  - `src/kernel/serde.ts` did not need direct code changes because existing spread-based serialization already preserved new log-entry fields.
  - Lifecycle trace observability was implemented by extending `triggerFirings` union rather than introducing a separate trace field.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/initial-state.test.js` passed.
  - `node --test dist/test/unit/phase-advance.test.js` passed.
  - `node --test dist/test/unit/serde.test.js` passed.
  - `node --test dist/test/integration/game-loop.test.js` passed.
  - `node --test dist/test/integration/fitl-card-lifecycle.test.js` passed.
  - `node --test dist/test/integration/sim/simulator-golden.test.js` passed.
  - Additional regression checks:
    - `node --test dist/test/unit/apply-move.test.js` passed.
    - `node --test dist/test/unit/game-loop-api-shape.test.js` passed.
