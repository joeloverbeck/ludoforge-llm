# AGENTS-004 - GreedyAgent Tiebreak and Bounded Candidate Selection

**Status**: ✅ COMPLETED
**Spec**: `specs/09-agents.md`
**Depends on**: none (current baseline already includes `GreedyAgent` core/evaluator)

## Goal
Add deterministic tie-breaking and optional bounded move evaluation (`maxMovesToEvaluate`) for `GreedyAgent` to cap runtime on high-branching positions.

## Assumption Reassessment (2026-02-10)
- `src/agents/greedy-agent.ts` currently evaluates all legal moves and resolves ties by first-encountered move; it does not consume RNG.
- `GreedyAgent` currently has no config constructor and no `maxMovesToEvaluate` support.
- Existing tests are in `test/unit/agents/greedy-agent-core.test.ts`; there is no `greedy-agent-tiebreak.test.ts` yet.
- `AGENTS-003` is not present in `tickets/`; this ticket can proceed against the current `specs/09-agents.md` baseline.

## Scope
- Add `GreedyAgentConfig` with `maxMovesToEvaluate?: number`.
- Implement deterministic candidate selection when `maxMovesToEvaluate < legalMoves.length`.
- Ensure full-candidate evaluation keeps pre-tiebreak RNG unchanged.
- Implement PRNG-based tie-break among equal best-scored moves.

## File List Expected To Touch
- `src/agents/greedy-agent.ts`
- `src/agents/select-candidates.ts` (new)
- `src/agents/factory.ts` (optional; only if factory config wiring is needed)
- `src/agents/index.ts`
- `test/unit/agents/greedy-agent-core.test.ts` (extend)
- `test/unit/agents/select-candidates.test.ts` (new)

## Out Of Scope
- Redesign of scoring heuristics.
- Changes to random agent behavior.
- Introduction of MCTS/UCT or deeper search.
- Simulator-level performance benchmarking harness.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/greedy-agent-core.test.ts`
  - Equal-score tie is resolved via `nextInt` and known-seed golden result.
  - Tie path advances RNG exactly once.
  - Non-tie path does not perform tie-break RNG draw.
- `test/unit/agents/select-candidates.test.ts`
  - When `maxMovesToEvaluate` is unset or `>= legalMoves.length`, all moves are returned and RNG is unchanged.
  - When bounded, candidate count is capped and deterministic for same input RNG.
  - Bounded candidate selection never returns moves outside `legalMoves` and contains no duplicates.
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Deterministic candidate set for identical inputs and RNG.
- Candidate selection and tie-break both use kernel PRNG (never `Math.random`).
- `GreedyAgent` remains pure and RNG-threaded via return value only.
- Output move is always in original `legalMoves`.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `GreedyAgentConfig` with validated `maxMovesToEvaluate`.
  - Added deterministic bounded candidate selection in `src/agents/select-candidates.ts`.
  - Updated `GreedyAgent` to evaluate selected candidates and use PRNG tie-breaks only when needed.
  - Added/extended unit tests in `test/unit/agents/select-candidates.test.ts` and `test/unit/agents/greedy-agent-core.test.ts`.
- **Deviations from plan**:
  - Reused/extended existing `greedy-agent-core` tests instead of creating a separate `greedy-agent-tiebreak` file.
  - `src/agents/factory.ts` required no changes because default `GreedyAgent` construction remains compatible.
- **Verification**:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
