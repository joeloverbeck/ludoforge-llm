# KERGAMLOOTRI-006 - Phase/Turn Advancement and No-Legal-Move Stall Guard

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-003`, `KERGAMLOOTRI-005`

## Goal
Implement deterministic phase/turn transitions and `advanceToDecisionPoint` so empty decision points auto-progress with deterministic stall protection.

## Assumption Reassessment (2026-02-10)
- `src/kernel/action-usage.ts` already implements `resetPhaseUsage` and `resetTurnUsage` from `KERGAMLOOTRI-003`; this ticket must not re-implement them.
- `src/kernel/phase-advance.ts` still contains a `KERGAMLOOTRI-001` stub for `advancePhase`.
- `src/kernel/apply-move.ts` currently validates + applies move + dispatches `actionResolved` triggers + updates hash, but does not perform phase/turn progression or no-legal-move auto-advance.
- `test/unit/phase-advance.test.ts` does not exist.
- `src/kernel/terminal.ts` (`terminalResult`) is still a stub. Because terminal computation is out of scope here, `advanceToDecisionPoint` is implemented against current capabilities and explicitly bounded by stall-guard behavior.

## Scope
- Implement `advancePhase` in `src/kernel/phase-advance.ts` using existing action-usage helpers.
- Implement turn-boundary advancement and `activePlayerOrder` handling.
- Dispatch lifecycle triggers in required order:
  - intra-turn: `phaseExit` then `phaseEnter`
  - turn boundary path: `phaseExit(lastPhase)`, `turnEnd`, turn rollover, `turnStart`, `phaseEnter(firstPhase)`
- Implement `advanceToDecisionPoint` with deterministic bounded auto-advance while legal moves are empty:
  - guard `maxAutoAdvancesPerMove = (playerCount * phaseCount) + 1`
  - deterministic `STALL_LOOP_DETECTED` error when exceeded
- Wire progression into `applyMove` after `actionResolved` trigger dispatch.

## File List Expected To Touch
- `src/kernel/phase-advance.ts`
- `src/kernel/apply-move.ts`
- `test/unit/phase-advance.test.ts` (new)
- `test/unit/apply-move.test.ts` (minimal assertions for progression integration)

## Out Of Scope
- Re-implementing or refactoring `resetPhaseUsage` / `resetTurnUsage` internals.
- Legal move filtering semantics.
- Trigger matching semantics (only lifecycle ordering hookup is in scope).
- Terminal condition computation internals.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/phase-advance.test.ts`
  - phase advances in declared order.
  - last phase advances turn and player as configured.
  - per-phase counters reset on phase boundary.
  - per-turn counters reset on turn boundary.
  - lifecycle event order is exact and deterministic:
    - intra-turn: `phaseExit` then `phaseEnter`
    - turn boundary path: `phaseExit(lastPhase)`, `turnEnd`, `turnStart`, `phaseEnter(firstPhase)`
  - empty decision points auto-advance to next legal decision point.
  - bounded pathological loop throws `STALL_LOOP_DETECTED`.
- Existing move tests remain green:
  - `test/unit/legal-moves.test.ts`
  - `test/unit/apply-move.test.ts`

## Invariants That Must Remain True
- Game cannot remain indefinitely at zero-legal-move state; deterministic stall guard fails fast.
- Lifecycle trigger order is stable and spec-compliant.
- Counter resets never affect `gameCount`.

## Outcome
- Completion date: 2026-02-10
- What was actually changed:
  - Implemented `advancePhase` with deterministic phase progression, round-robin/fixed active-player rollover, lifecycle trigger dispatch, and per-phase/per-turn usage resets.
  - Implemented `advanceToDecisionPoint` with bounded auto-advance and deterministic `STALL_LOOP_DETECTED` failure.
  - Wired `applyMove` to run progression after `actionResolved` trigger dispatch and before final hash capture.
  - Added `test/unit/phase-advance.test.ts` for ordering, resets, turn rollover, auto-advance, and stall guard coverage.
  - Added a progression integration assertion to `test/unit/apply-move.test.ts`.
- Deviations from the original plan:
  - `resetPhaseUsage` and `resetTurnUsage` were already implemented by prior ticket work and were not changed.
  - Turn-boundary ordering coverage was clarified to include `phaseExit(lastPhase)` before `turnEnd`, matching current progression semantics.
- Verification results:
  - `npm test` passed (build + unit + integration).
