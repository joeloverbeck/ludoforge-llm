# GAMEARCH-001: Free-Op Template Discovery and Decision-Time Zone Constraint

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: none

## Description

`freeOperationGrants` with `zoneFilter` can currently be valid in data but undiscoverable in `legalMoves` for template-based actions.

### Reassessed Current State (2026-02-14)

- Decision-time zone constraint wiring is already present in `legalChoices`:
  - `resolveFreeOperationZoneFilter` resolves active applicable grant filters.
  - `evalQuery` automatically intersects `zones`/`mapSpaces` queries with `freeOperationZoneFilter`.
- Final validation is already authoritative in `applyMove` via `isFreeOperationGrantedForMove`.
- The remaining architectural gap is in free-op variant discovery:
  - `applyPendingFreeOperationVariants` currently calls `isFreeOperationGrantedForMove` during `legalMoves`.
  - That function depends on pre-resolution move params (`moveZoneCandidates`) and can reject template moves before decisions bind zone values.
  - Result: satisfiable free-op decision paths may be hidden from `legalMoves`.

### What Must Change

1. Keep existing decision-time and final validation architecture, but fix discovery:
   - Allow free-op template variants when a grant is faction/action applicable, even before zone decisions are bound.
   - Preserve zone constraint enforcement at decision checkpoints (`legalChoices`) and final `applyMove`.
2. Stop using pre-resolution zone extraction as the primary gate for template variant emission in `legalMoves`.
3. Keep final `applyMove` validation authoritative and deterministic.
4. No compatibility aliasing for legacy directive formats.

## Files to Touch

- `src/kernel/legal-moves-turn-order.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/legal-moves.ts` (if template-vs-concrete free-op gating needs profile awareness)
- `test/unit/legal-moves.test.ts`
- `test/unit/kernel/move-decision-sequence.test.ts`
- `test/integration/fitl-event-free-operation-grants.test.ts`

## Out of Scope

- Grant consumption policy redesign.
- Eligibility-override directive migration.

## Acceptance Criteria

### Tests That Must Pass

1. New/updated unit tests prove:
   - Free-op template move appears when action is grant-applicable even before zone decisions.
   - Free-op decision flow enforces `zoneFilter` at decision checkpoints (disallowed zone cannot be selected).
   - Final move validation still rejects a free-op move when selected zone violates `zoneFilter`.
   - Free-op decision flow remains legal when selected zone satisfies `zoneFilter`.
2. Integration test covers card-75-like Cambodia filter behavior via full decision sequence.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Engine remains game-agnostic; all game semantics come from `GameSpecDoc`/`GameDef` data.
- `applyMove` remains final legality authority.
- No backwards-compatible alias path for legacy free-op directives.

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Split free-op grant checks into two layers:
    - action/faction applicability (`isFreeOperationApplicableForMove`)
    - full authorization including `zoneFilter` (`isFreeOperationGrantedForMove`)
  - Updated free-op template discovery so `legalMoves` can emit free-op template variants when:
    - the grant is action/faction applicable, and
    - the move remains decision-sequence satisfiable.
  - Removed duplicated decision-sequence evaluation in free-op template discovery by:
    - using a single `choose: () => undefined` checkpoint probe, and
    - running satisfiability validation only when the move is still unresolved at that checkpoint.
  - Kept decision-time and final validation behavior authoritative:
    - decision checkpoints constrain zone choices via `freeOperationZoneFilter`
    - final `applyMove` still rejects out-of-filter free-op submissions.
  - Added/updated tests in:
    - `test/unit/legal-moves.test.ts`
    - `test/unit/kernel/move-decision-sequence.test.ts`
    - `test/integration/fitl-event-free-operation-grants.test.ts`
- **Deviation from original plan**:
  - `src/kernel/legal-choices.ts` and `src/kernel/legal-moves.ts` did not require code changes; existing architecture there already matched intended constraints.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
