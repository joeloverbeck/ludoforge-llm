# AGENTS-005 - Agent Spec Parsing and Validation

**Status**: Proposed
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`, `AGENTS-002`, `AGENTS-003`

## Goal
Finalize `parseAgentSpec` behavior for CLI/simulator consumption by enforcing robust parsing, normalization, and validation rules.

## Scope
- Implement parsing of comma-separated agent strings with trim + lowercase normalization.
- Enforce exact `playerCount` match.
- Validate allowed agent names (`random`, `greedy`) with descriptive errors.
- Return correctly ordered agent instance array via `createAgent`.

## File List Expected To Touch
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/parse-agent-spec.test.ts` (new)

## Out Of Scope
- CLI argument parsing (`specs/12-cli.md`) or command wiring.
- Simulator game-loop execution changes.
- New agent families or alias names.
- Config syntax beyond comma-separated types.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/parse-agent-spec.test.ts`
  - `parseAgentSpec('random,greedy', 2)` returns two agents in order.
  - Whitespace and case normalization works (`' Random , GREEDY '`).
  - Player count mismatch throws with actual/expected counts in message.
  - Unknown agent token throws and lists allowed values.
  - Empty tokens (e.g., `'random,,greedy'`) are ignored only if remaining count still matches `playerCount`.
- Baseline unit suite remains green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Returned agent list length always equals `playerCount`.
- Agent ordering in output matches normalized input order.
- Validation failures are deterministic and side-effect free.
- `parseAgentSpec` does not mutate input strings or global state.
