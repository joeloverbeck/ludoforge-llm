# AGENTS-001 - Agents Module Foundation and Public API

**Status**: Proposed
**Spec**: `specs/09-agents.md`

## Goal
Establish the minimal agents module structure and exported API surface for Spec 09, without implementing Random or Greedy decision logic yet.

## Scope
- Create typed public entrypoints for agents module:
  - `AgentType` union (`'random' | 'greedy'`)
  - `createAgent(type)`
  - `parseAgentSpec(spec, playerCount)`
- Wire exports so downstream simulator code can import from `src/agents`.
- Add failing-forward stubs only where needed to keep incremental landing possible.

## File List Expected To Touch
- `src/agents/index.ts`
- `src/agents/factory.ts` (new)
- `src/agents/types.ts` (new, only if needed for local `AgentType` exports)
- `test/unit/agents/factory-api-shape.test.ts` (new)

## Out Of Scope
- Random move selection behavior.
- Greedy scoring/lookahead behavior.
- Any `maxMovesToEvaluate` logic.
- Simulator integration (`Spec 10`) changes.
- Changes to kernel game-loop behavior (`legalMoves`, `applyMove`, `terminalResult`).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/factory-api-shape.test.ts`
  - `createAgent('random')` returns an object with `chooseMove`.
  - `createAgent('greedy')` returns an object with `chooseMove`.
  - `createAgent('unknown' as never)` throws `Unknown agent type`.
  - `parseAgentSpec` export exists and validates count mismatch.
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- `Agent` interface contract remains sourced from `src/kernel/types.ts` (no duplicate competing agent interface).
- Agents module exports are deterministic and side-effect free at import time.
- No use of `Math.random()` is introduced.
