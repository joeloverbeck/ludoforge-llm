# AGENTS-001 - Agents Module Foundation and Public API

**Status**: ✅ COMPLETED
**Spec**: `specs/09-agents.md`

## Goal
Establish the minimal agents module structure and exported API surface for Spec 09, without implementing Random or Greedy decision logic yet.

## Reassessed Assumptions (2026-02-10)
- `src/agents/index.ts` is currently a placeholder (`export {}`), so no agents API has landed yet.
- No agent factory or agent parsing implementation currently exists in `src/agents/`.
- No existing agent-focused unit tests currently exist under `test/unit/`.
- `Agent` interface already exists in `src/kernel/types.ts` and must remain the single source of truth.

## Scope
- Create typed public entrypoints for agents module:
  - `AgentType` union (`'random' | 'greedy'`)
  - `createAgent(type)`
  - `parseAgentSpec(spec, playerCount)`
- Wire exports so downstream simulator code can import from `src/agents`.
- Add failing-forward stubs only where needed to keep incremental landing possible.
- Keep all behavior limited to API shape and input validation; do not implement move-selection logic in this ticket.

## File List Expected To Touch
- `src/agents/index.ts`
- `src/agents/factory.ts` (new)
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

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added `src/agents/factory.ts` with:
    - `AgentType` union (`'random' | 'greedy'`)
    - `createAgent(type)` returning deterministic stub agents that expose `chooseMove`
    - `parseAgentSpec(spec, playerCount)` with normalization, count validation, and unknown-type validation
  - Updated `src/agents/index.ts` to export factory APIs.
  - Added `test/unit/agents/factory-api-shape.test.ts` covering API shape and parsing validation.
- Deviations from original plan:
  - No `src/agents/types.ts` was added; `AgentType` is exported directly from `src/agents/factory.ts` to avoid unnecessary file surface.
  - Added explicit unknown-agent validation test for `parseAgentSpec` to strengthen edge-case coverage.
- Verification:
  - `npm run test:unit -- --coverage=false` passed.
  - `node --test dist/test/unit/agents/factory-api-shape.test.js` passed.
