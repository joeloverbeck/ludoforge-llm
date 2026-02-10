# KERGAMLOOTRI-006 - Phase/Turn Advancement and No-Legal-Move Stall Guard

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-003`, `KERGAMLOOTRI-005`

## Goal
Implement deterministic phase/turn transitions and `advanceToDecisionPoint` so non-terminal empty decision points auto-progress or fail with deterministic stall protection.

## Scope
- Implement `advancePhase`, `resetPhaseUsage`, `resetTurnUsage`.
- Implement turn-boundary advancement and `activePlayerOrder` handling.
- Dispatch lifecycle triggers in required order:
  - intra-turn: `phaseExit` then `phaseEnter`
  - new turn: `turnEnd`, turn rollover, `turnStart`, then `phaseEnter(firstPhase)`
- Implement `advanceToDecisionPoint` with:
  - repeated no-legal-move progression while non-terminal
  - guard `maxAutoAdvancesPerMove = (playerCount * phaseCount) + 1`
  - deterministic `STALL_LOOP_DETECTED` error when exceeded

## File List Expected To Touch
- `src/kernel/phase-advance.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/apply-move.ts` (wire in progression step; keep changes minimal)
- `test/unit/phase-advance.test.ts` (new)

## Out Of Scope
- Legal move filtering semantics.
- Trigger matching semantics (only dispatch ordering hookup is in scope).
- Terminal condition computation internals.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/phase-advance.test.ts`
  - phase advances in declared order.
  - last phase advances turn and player as configured.
  - per-phase counters reset on phase boundary.
  - per-turn counters reset on turn boundary.
  - startup/new-turn lifecycle event order is exact and deterministic.
  - empty decision points auto-advance to next legal decision point.
  - bounded pathological loop throws `STALL_LOOP_DETECTED`.
- Existing move tests remain green:
  - `test/unit/legal-moves.test.ts`
  - `test/unit/apply-move.test.ts`

## Invariants That Must Remain True
- Game cannot remain indefinitely at non-terminal zero-legal-move state.
- Lifecycle trigger order is stable and spec-compliant.
- Counter resets never affect `gameCount`.
