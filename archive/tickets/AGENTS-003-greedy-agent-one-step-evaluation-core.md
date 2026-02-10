# AGENTS-003 - GreedyAgent One-Step Evaluation Core

**Status**: ✅ COMPLETED
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`

## Goal
Implement core `GreedyAgent` one-step lookahead with deterministic best-score selection (before bounded candidate sampling support).

## Scope
- Add `GreedyAgent` class implementing `Agent`.
- For each legal move, call `applyMove` and evaluate resulting state with integer-only scoring.
- Implement terminal-priority behavior in evaluator:
  - immediate win (`terminalResult.type === "win"` for `playerId`) >> all
  - immediate non-win terminal (`lossAll`, opponent `win`, or non-top-ranked `score`) << nonterminal alternatives
  - draw neutral
- Return single best move without RNG advancement when no tie is present.

## Reassessed Code/Test Assumptions
- `src/agents/factory.ts` already supports `'greedy'` in `AgentType` but currently returns an unimplemented placeholder; this ticket must replace that with a real `GreedyAgent` instance.
- `test/unit/agents/factory-api-shape.test.ts` already exists and should be minimally extended instead of replaced.
- Kernel terminal semantics are `TerminalResult` union (`win | lossAll | draw | score`) with `win.player` and `score.ranking`; evaluator logic must use these actual shapes (not `winner` fields).
- Agent tests in this repo live under `test/unit/agents/`; new tests should follow that layout.

## File List Expected To Touch
- `src/agents/greedy-agent.ts` (new)
- `src/agents/evaluate-state.ts` (new)
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/greedy-agent-core.test.ts` (new)
- `test/unit/agents/evaluate-state.test.ts` (new)
- `test/unit/agents/factory-api-shape.test.ts` (modify minimally)

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
  - Immediate terminal non-win move is avoided when nonterminal alternative exists.
  - Same input state + same RNG yields same `{ move, rng }` when no tie path is involved.
- `test/unit/agents/evaluate-state.test.ts`
  - Evaluator returns expected integer score for fixture state (including per-player var normalization).
  - Evaluator terminal scoring constants dominate nonterminal heuristics.
  - Evaluator performs integer-only arithmetic (no fractional accumulation assertions).
- `test/unit/agents/factory-api-shape.test.ts`
  - `createAgent('greedy')` returns implemented greedy agent that can choose a move for a simple one-legal-move input.
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- `GreedyAgent` only chooses from provided `legalMoves`.
- One-step lookahead only (`applyMove` exactly one ply deep per candidate).
- Heuristic arithmetic remains integer-only.
- Determinism for identical `def/state/legalMoves/rng` input with no tie.

## Outcome
- Completion date: 2026-02-10
- Implemented `GreedyAgent` and `evaluateState`, and wired `createAgent('greedy')` to the concrete implementation.
- Added/updated unit tests for greedy move selection, evaluator scoring/terminal priority, and factory behavior with a runnable greedy instance.
- Compared to original plan, implementation intentionally kept tie-breaking deterministic without RNG advancement (first-best selection) because random tie-breaking was explicitly out of scope.
- Verification: `npm run build` and `npm run test:unit -- --coverage=false` passed.
