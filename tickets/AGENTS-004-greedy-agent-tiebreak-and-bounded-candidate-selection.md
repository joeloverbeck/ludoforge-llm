# AGENTS-004 - GreedyAgent Tiebreak and Bounded Candidate Selection

**Status**: Proposed
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-003`

## Goal
Add deterministic tie-breaking and optional bounded move evaluation (`maxMovesToEvaluate`) for `GreedyAgent` to cap runtime on high-branching positions.

## Scope
- Add `GreedyAgentConfig` with `maxMovesToEvaluate?: number`.
- Implement deterministic candidate selection when `maxMovesToEvaluate < legalMoves.length`.
- Ensure full-candidate evaluation keeps pre-tiebreak RNG unchanged.
- Implement PRNG-based tie-break among equal best-scored moves.

## File List Expected To Touch
- `src/agents/greedy-agent.ts`
- `src/agents/select-candidates.ts` (new)
- `src/agents/factory.ts` (if constructor wiring is needed)
- `src/agents/index.ts`
- `test/unit/agents/greedy-agent-tiebreak.test.ts` (new)
- `test/unit/agents/select-candidates.test.ts` (new)

## Out Of Scope
- Redesign of scoring heuristics.
- Changes to random agent behavior.
- Introduction of MCTS/UCT or deeper search.
- Simulator-level performance benchmarking harness.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/greedy-agent-tiebreak.test.ts`
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
