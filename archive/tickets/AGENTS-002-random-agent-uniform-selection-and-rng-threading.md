# AGENTS-002 - RandomAgent Uniform Selection and RNG Threading

**Status**: ✅ COMPLETED
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`

## Goal
Implement `RandomAgent` with strict RNG-threading semantics and deterministic uniform move selection from `legalMoves`.

## Scope
- Add `RandomAgent` class implementing `Agent`.
- Implement `chooseMove` behavior for empty, singleton, and multi-move inputs.
- Wire `createAgent('random')` to return `RandomAgent`.
- Keep existing `createAgent('greedy')` placeholder behavior unchanged.
- Ensure randomness uses kernel PRNG `nextInt` only.
- Add unit coverage for deterministic and rough-uniform behavior.

## Assumptions (Reassessed)
- `src/agents/factory.ts` already exists and currently returns placeholder agents that throw.
- `src/agents/index.ts` already re-exports the factory module.
- `test/unit/agents/factory-api-shape.test.ts` already covers factory exports and parse behavior.
- No dedicated RandomAgent test file exists yet.

## File List Expected To Touch
- `src/agents/random-agent.ts` (new)
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/random-agent.test.ts` (new)
- `test/unit/agents/factory-api-shape.test.ts`

## Out Of Scope
- Greedy lookahead/evaluation logic.
- `parseAgentSpec` tokenization and error-message formatting changes.
- Simulator loop integration.
- PRNG algorithm changes in `src/kernel/prng.ts`.
- Implementing `GreedyAgent` behavior beyond preserving current placeholder semantics.

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

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added `src/agents/random-agent.ts` with strict Spec 09 behavior:
    - throws on empty `legalMoves`
    - returns singleton move without advancing RNG
    - uses `nextInt` for uniform multi-move selection and returns threaded RNG
  - Updated `src/agents/factory.ts` so `createAgent('random')` returns `new RandomAgent()`.
  - Kept `createAgent('greedy')` as placeholder/unimplemented, as scoped.
  - Updated `src/agents/index.ts` to export `RandomAgent`.
  - Added `test/unit/agents/random-agent.test.ts` and extended `test/unit/agents/factory-api-shape.test.ts`.
- Deviations from original plan:
  - `src/agents/index.ts` now also exports `RandomAgent` to make the implementation part of the module surface.
  - Existing factory test file was extended instead of adding a separate factory wiring test file.
- Verification results:
  - `npm run test:unit -- --coverage=false` passed.
