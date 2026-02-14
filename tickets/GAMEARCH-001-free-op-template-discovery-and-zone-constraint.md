# GAMEARCH-001: Free-Op Template Discovery and Decision-Time Zone Constraint

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: none

## Description

`freeOperationGrants` with `zoneFilter` can currently be valid in data but undiscoverable in `legalMoves` for template-based actions. The engine tests grant eligibility too early (before decisions bind target zones), so legal free-op variants may never surface.

### What Must Change

1. Add a decision-aware free-op gating model for template moves:
   - Allow free-op template variants when grant/action applicability matches.
   - Enforce `zoneFilter` after decision bindings resolve (at `legalChoices`/decision sequence checkpoints and final apply).
2. Replace heuristic pre-resolution zone extraction as primary authorization for template moves.
3. Keep final `applyMove` validation authoritative and deterministic.
4. No compatibility aliasing for legacy directive formats.

## Files to Touch

- `src/kernel/legal-moves-turn-order.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/legal-choices.ts`
- `src/kernel/move-decision-sequence.ts` (if decision-time legality enforcement is added there)
- `test/unit/kernel/legal-moves.test.ts`
- `test/unit/kernel/move-decision-sequence.test.ts`
- `test/integration/fitl-event-free-operation-grants.test.ts`

## Out of Scope

- Grant consumption policy redesign.
- Eligibility-override directive migration.

## Acceptance Criteria

### Tests That Must Pass

1. New/updated unit tests prove:
   - Free-op template move appears when action is grant-applicable even before zone decisions.
   - Free-op decision flow becomes illegal when selected zone violates `zoneFilter`.
   - Free-op decision flow remains legal when selected zone satisfies `zoneFilter`.
2. Integration test covers card-75-like Cambodia filter behavior via full decision sequence.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Engine remains game-agnostic; all game semantics come from `GameSpecDoc`/`GameDef` data.
- `applyMove` remains final legality authority.
- No backwards-compatible alias path for legacy free-op directives.
