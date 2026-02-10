# KERGAMLOOTRI-008 - Game Loop Integration, Determinism, and Golden Coverage

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-002`, `KERGAMLOOTRI-003`, `KERGAMLOOTRI-004`, `KERGAMLOOTRI-005`, `KERGAMLOOTRI-006`, `KERGAMLOOTRI-007`

## Goal
Add cross-module verification that the full Spec 06 loop behaves correctly over multi-turn execution and remains deterministic under repeated runs.

## Assumption Reassessment (2026-02-10)
- Core Spec 06 kernel modules already exist in `src/kernel/`:
  - `initial-state.ts`
  - `legal-moves.ts`
  - `apply-move.ts`
  - `trigger-dispatch.ts`
  - `phase-advance.ts`
  - `action-usage.ts`
  - `terminal.ts`
- Baseline unit coverage already exists for the above modules:
  - `test/unit/initial-state.test.ts`
  - `test/unit/legal-moves.test.ts`
  - `test/unit/apply-move.test.ts`
  - `test/unit/trigger-dispatch.test.ts`
  - `test/unit/phase-advance.test.ts`
  - `test/unit/terminal.test.ts`
- Existing determinism integration coverage exists at `test/integration/determinism-full.test.ts`, but it does not exercise the full `initialState` + `legalMoves` + `applyMove` game-loop API path.
- The original ticket's "all files are new" assumption is incorrect; this ticket is now scoped as a focused gap-closure task, not a greenfield Spec 06 implementation.

## Scope (Updated)
- Add/strengthen tests covering:
  - multi-turn gameplay progression via `applyMove` + automatic phase/turn advancement
  - terminal-state handling at empty decision points (non-terminal auto-advance only)
  - deterministic replay across full game-loop APIs (same seed + same policy => same hash trajectory and trigger logs)
- Add a dedicated game-loop golden test for:
  - canonical initial legal move ordering
  - known final hash after a fixed move sequence
- Apply only minimal production-code changes required to satisfy Spec 06 invariants validated by those tests.

## File List Expected To Touch
- `src/kernel/phase-advance.ts` (only if required by invariant gap)
- `test/unit/phase-advance.test.ts` (coverage strengthening)
- `test/integration/game-loop.test.ts` (new)
- `test/unit/game-loop.golden.test.ts` (new)

## Out Of Scope
- New kernel runtime features beyond Spec 06 behavior.
- Broad test harness refactors.
- Performance benchmarking or stress tooling outside deterministic correctness tests.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/integration/game-loop.test.ts`
  - scripted multi-turn scenario reaches expected checkpoints.
  - terminal result is correct and progression stops once terminal.
  - duplicate-run replay hash sequences are identical.
  - duplicate-run replay trigger logs are identical.
- `test/unit/game-loop.golden.test.ts`
  - seed `42` initial legal move snapshot matches canonical ordering.
  - seed `42` + fixed move script final hash matches expected value.
- `test/unit/phase-advance.test.ts`
  - terminal state with no legal moves does not auto-advance or stall.
- Full baseline remains green:
  - `npm test`

## Invariants That Must Remain True
- Same seed + same move sequence always yields identical state hash trajectory.
- Test fixtures encode deterministic order-sensitive expectations (no nondeterministic assertions).
- Integration tests do not mutate shared fixtures at runtime.
- `advanceToDecisionPoint` only auto-advances while state is non-terminal (Spec 06).

## Outcome
- Completed on 2026-02-10.
- Updated ticket assumptions/scope to match current repository reality (Spec 06 modules and most unit coverage were already implemented).
- Implemented a minimal production fix in `src/kernel/phase-advance.ts` so `advanceToDecisionPoint` only auto-advances when `terminalResult(...) === null`.
- Added/strengthened tests:
  - `test/unit/phase-advance.test.ts`: terminal + no-legal-moves state does not auto-advance or stall.
  - `test/integration/game-loop.test.ts`: scripted multi-turn progression and terminal-stop behavior, plus deterministic replay for PRNG-indexed move policy.
  - `test/unit/game-loop.golden.test.ts`: canonical initial legal move ordering and fixed-script final hash golden.
- Deviations from original plan:
  - Did not add `test/integration/determinism-game-loop.test.ts`; determinism assertions were added to `test/integration/game-loop.test.ts` instead to avoid duplicative harness structure.
  - File-touch list was corrected from "new Spec 06 implementation files" to focused gap-closure changes.
- Verification:
  - `npm test` passed.
