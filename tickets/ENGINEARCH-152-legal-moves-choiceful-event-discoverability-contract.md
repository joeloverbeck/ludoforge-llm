# ENGINEARCH-152: Make `legalMoves()` discover choiceful event moves with legal completions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/legal-moves.ts`, move applicability/preflight, pending-decision satisfiability for event/action surfacing
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`, `packages/engine/src/kernel/move-decision-sequence.ts`, `packages/engine/src/kernel/decision-sequence-satisfiability.ts`, `packages/engine/src/kernel/legal-choices.ts`, `packages/engine/test/integration/fitl-commitment-phase.test.ts`, `packages/engine/test/integration/fitl-events-international-forces.test.ts`

## Problem

The current move surface appears to hide some legal `event` moves when they require unresolved player choice and expose multiple valid completions. In practice, a choiceful shaded event may be executable through the canonical move shape plus `legalChoicesDiscover()`/`resolveMoveDecisionSequence()`, while not being surfaced by `legalMoves()`. That makes legality/discoverability depend on whether a decision tree collapses to a forced outcome, which is not a sound engine contract for UI, automation, or agent play.

## Assumption Reassessment (2026-03-12)

1. Current code and tests show that `resolveMoveDecisionSequence()` can expose pending chooser-owned event decisions even when `legalMoves()` does not surface the originating move. This indicates a gap between move discovery and move completion, not an inability to execute the event.
2. Existing FITL tests already encode cross-faction chooser ownership for events such as International Forces shaded, so the engine already intends to support “executing faction selects event, different faction owns details” semantics generically.
3. The mismatch is architectural, not Fire-in-the-Lake-specific: move discoverability belongs in the agnostic kernel contract. The fix must not add FITL branches or event-specific exceptions.

## Architecture Check

1. The clean design is: if at least one legal completion exists for a canonical move, `legalMoves()` must surface that move regardless of whether completion is forced or choiceful. This is cleaner than papering over gaps in tests, UI, or per-event authoring.
2. The work stays game-agnostic. `GameSpecDoc` continues to declare event choices; `GameDef`/kernel only own the generic rule for when a move with pending decisions is discoverable.
3. No backwards-compatibility shim should be introduced. Tighten the canonical contract and update any callers/tests that depended on the weaker behavior.

## What to Change

### 1. Reconcile move discovery with legal completion semantics

Audit the code path from action/event applicability through `legalMoves()` filtering and decision-sequence satisfiability. Make the move surface treat unresolved but completable decisions as discoverable legal moves whenever at least one valid completion path exists.

### 2. Encode the contract explicitly in tests

Add focused regression coverage for:
- choiceful events with multiple valid chooser-owned combinations,
- cross-faction chooser ownership,
- forced-choice events that already surface today,
- non-event actions if the same bug exists outside the event path.

### 3. Document and harden invariants

Wherever legality/preflight contracts are documented in tests or helper utilities, update them so future work does not regress toward “only forced-choice moves are discoverable”.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify, only if contract alignment requires it)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify or add if absent in current layout)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)

## Out of Scope

- Re-authoring individual FITL cards beyond what is required to prove the kernel contract.
- UI workarounds that synthesize hidden moves outside the engine.
- Any game-specific branching in event compilation or simulation.

## Acceptance Criteria

### Tests That Must Pass

1. A choiceful event with multiple valid completions is surfaced by `legalMoves()` as a legal base move.
2. The same surfaced move yields the expected pending chooser-owned decision through `legalChoicesDiscover()` or `resolveMoveDecisionSequence()`.
3. Existing suite: `node scripts/run-tests.mjs test/integration/fitl-commitment-phase.test.ts test/integration/fitl-events-international-forces.test.ts`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalMoves()` discoverability does not depend on whether a pending decision tree has one completion or many.
2. Kernel legality remains game-agnostic; no Fire-in-the-Lake identifiers or branches leak into engine logic.
3. Canonical move shapes remain stable: unresolved decisions are completed through choice APIs, not by inventing alternate hidden move forms.

## Tests

### New/Modified Tests

1. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — lock in that Great Society shaded is discoverable as an event move even when several 3-of-N US-piece selections exist.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — preserve cross-faction chooser-owned event semantics while checking move discoverability.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add a minimal game-agnostic reproducer for a move that is completable but choiceful.
4. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — confirm the legal-completion oracle used by move discovery matches runtime completion behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node scripts/run-tests.mjs test/integration/fitl-commitment-phase.test.ts test/integration/fitl-events-international-forces.test.ts`
3. `node scripts/run-tests.mjs test/unit/kernel/legal-moves.test.ts test/unit/kernel/move-decision-sequence.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
