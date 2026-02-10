# AGENTS-002 - RandomAgent Uniform Selection and RNG Threading

**Status**: Proposed
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`

## Goal
Implement `RandomAgent` with strict RNG-threading semantics and deterministic uniform move selection from `legalMoves`.

## Scope
- Add `RandomAgent` class implementing `Agent`.
- Implement `chooseMove` behavior for empty, singleton, and multi-move inputs.
- Ensure randomness uses kernel PRNG `nextInt` only.
- Add unit coverage for deterministic and rough-uniform behavior.

## File List Expected To Touch
- `src/agents/random-agent.ts` (new)
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/random-agent.test.ts` (new)

## Out Of Scope
- Greedy lookahead/evaluation logic.
- `parseAgentSpec` tokenization and error-message formatting changes.
- Simulator loop integration.
- PRNG algorithm changes in `src/kernel/prng.ts`.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/random-agent.test.ts`
  - Empty `legalMoves` throws descriptive error.
  - Single legal move returns same move and unchanged RNG.
  - Known-seed, 5-move golden selection matches expected index.
  - Known-seed, 2-move deterministic choice is stable.
  - Same input state + same RNG returns identical `{ move, rng }`.
  - Over 100 draws on 3 legal moves, each move is selected at least once.
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Returned move is always one of `legalMoves`.
- RNG is advanced exactly once for multi-move selection and not advanced for singleton selection.
- `RandomAgent` remains pure (no hidden mutable RNG state).
- No `Math.random()` usage.
