# ARCDECANDGEN-023: Event Deck `cardDriven` Interaction (Lasting Effect Expiry)

**Status**: ✅ COMPLETED
**Phase**: 8D (Generic Event Deck Subsystem — cardDriven interaction)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014 (turnOrder with cardDriven), ARCDECANDGEN-021 (event-execution.ts with `expireLastingEffects`)

## Goal

Ensure event-card lasting effects expire at the correct turn-flow boundaries using the existing `TurnFlowDuration` model (`'turn' | 'nextTurn' | 'round' | 'cycle'`), with teardown effects applied before removing expired effects.

## Assumption Reassessment

### Corrected assumptions
- Duration examples in this ticket were outdated (`'untilCoupRound'`, `'untilNextCard'`). The runtime uses `TurnFlowDuration` values: `'turn'`, `'nextTurn'`, `'round'`, and `'cycle'`.
- Expiry orchestration does **not** belong inside `src/kernel/turn-flow-lifecycle.ts`. The current architecture runs it in `src/kernel/phase-advance.ts` after `applyTurnFlowCardBoundary(...)` emits lifecycle trace entries.
- `src/kernel/turn-flow-lifecycle.ts` is intentionally focused on card movement and lifecycle trace emission; expiry is handled by `src/kernel/event-execution.ts` (`expireLastingEffectsAtBoundaries`) at phase/turn orchestration level.
- Non-`cardDriven` turn orders still legitimately expire `turn`/`nextTurn` effects at generic turn boundaries. Only `round`/`cycle` boundaries depend on card-driven lifecycle signals.

### Architecture decision
- Keep expiry in `phase-advance.ts` instead of moving it into `turn-flow-lifecycle.ts`.
- Rationale: boundary expiry is a cross-cutting turn-boundary concern, while `turn-flow-lifecycle.ts` should remain a pure card-lifecycle state transformer. This separation is cleaner, more extensible, and aligned with Spec 32 decomposition goals.

## File List (files to touch)

### Files to modify
- `test/unit/phase-advance.test.ts` — strengthen coverage for independent expiry of multiple active lasting effects in one boundary pass
- `tickets/ARCDECANDGEN-023-event-deck-carddriven-interaction.md` — update assumptions/scope to match current architecture

## Out of Scope

- **Refactoring expiry orchestration into `turn-flow-lifecycle.ts`** — intentionally avoided; current split is preferred architecture
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No event deck reshuffling**

## Acceptance Criteria

### Tests that must pass
- Relevant unit tests for phase advance/lasting effects pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New/strengthened tests
1. **"multiple lasting effects expire independently"** — effects with different boundary counters are processed correctly in one boundary pass
2. Existing `phase-advance` expiry tests continue to verify:
   - `turn`/`nextTurn` expiry
   - `cycle` expiry when coup lifecycle emits campaign boundary
   - teardown application and removal of expired effects

### Invariants that must remain true
- Lasting effects expire at the correct lifecycle point, not before
- Teardown effects always run before removal
- `expireLastingEffectsAtBoundaries` runs at turn boundary orchestration in `phase-advance.ts`
- Non-`cardDriven` games still expire `turn`/`nextTurn` durations; `round`/`cycle` remain card-driven boundary-dependent

## Outcome

- **Completion date**: February 13, 2026
- **What was changed**:
  - Corrected ticket assumptions and scope to match current architecture (`phase-advance.ts` orchestrates expiry; `turn-flow-lifecycle.ts` remains lifecycle-only).
  - Added/strengthened unit coverage in `test/unit/phase-advance.test.ts` with:
    - `expires multiple lasting effects independently on the same turn boundary`
- **Deviations from original plan**:
  - Did not move expiry calls into `turn-flow-lifecycle.ts`; this was determined architecturally inferior to the existing boundary orchestration in `phase-advance.ts`.
  - Replaced outdated duration terminology (`untilCoupRound`, `untilNextCard`) with canonical `TurnFlowDuration` values.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/phase-advance.test.js` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
