# AGENTS-003 - GreedyAgent One-Step Evaluation Core

**Status**: Proposed
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`

## Goal
Implement core `GreedyAgent` one-step lookahead with deterministic best-score selection (before bounded candidate sampling support).

## Scope
- Add `GreedyAgent` class implementing `Agent`.
- For each legal move, call `applyMove` and evaluate resulting state with integer-only scoring.
- Implement terminal-priority behavior in evaluator:
  - immediate win >> all
  - immediate loss << non-loss alternatives
  - draw neutral
- Return single best move without RNG advancement when no tie is present.

## File List Expected To Touch
- `src/agents/greedy-agent.ts` (new)
- `src/agents/evaluate-state.ts` (new)
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/greedy-agent-core.test.ts` (new)
- `test/unit/agents/evaluate-state.test.ts` (new)

## Out Of Scope
- `maxMovesToEvaluate` and candidate subsampling.
- Tie-breaking randomness among equal-scored moves.
- Changes to `applyMove` or `terminalResult` semantics.
- Multi-step lookahead.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/greedy-agent-core.test.ts`
  - Empty `legalMoves` throws descriptive error.
  - Move yielding higher immediate VP-like score is chosen.
  - Immediate winning move is preferred over higher-resource nonterminal move.
  - Immediate losing move is avoided when nonterminal alternative exists.
  - Same input state + same RNG yields same `{ move, rng }` when no tie path is involved.
- `test/unit/agents/evaluate-state.test.ts`
  - Evaluator returns expected integer score for fixture state (including per-player var normalization).
  - Evaluator terminal scoring constants dominate nonterminal heuristics.
  - Evaluator performs integer-only arithmetic (no fractional accumulation assertions).
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- `GreedyAgent` only chooses from provided `legalMoves`.
- One-step lookahead only (`applyMove` exactly one ply deep per candidate).
- Heuristic arithmetic remains integer-only.
- Determinism for identical `def/state/legalMoves/rng` input with no tie.
