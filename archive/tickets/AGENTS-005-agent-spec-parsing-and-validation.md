# AGENTS-005 - Agent Spec Parsing and Validation

**Status**: ✅ COMPLETED
**Spec**: `specs/09-agents.md`
**Depends on**: `AGENTS-001`, `AGENTS-002`, `AGENTS-003`

## Goal
Finalize and verify `parseAgentSpec` behavior for CLI/simulator consumption by enforcing robust parsing, normalization, and validation rules in the existing factory API surface.

## Reassessed Assumptions
- `parseAgentSpec` is already implemented in `src/agents/factory.ts`.
- Parsing and factory API tests already exist in `test/unit/agents/factory-api-shape.test.ts`.
- The remaining gap is explicit coverage for empty-token handling (`'random,,greedy'`) and stricter parse-focused assertions.

## Scope
- Preserve `createAgent`/`parseAgentSpec` public APIs and behavior shape.
- Verify parsing of comma-separated agent strings with trim + lowercase normalization.
- Verify exact `playerCount` match enforcement.
- Verify allowed agent names (`random`, `greedy`) with descriptive errors.
- Verify correctly ordered agent instance array returned via `createAgent`.
- Add/strengthen focused tests for parse invariants; avoid broad refactors.

## File List Expected To Touch
- `src/agents/factory.ts`
- `src/agents/index.ts`
- `test/unit/agents/factory-api-shape.test.ts`

## Out Of Scope
- CLI argument parsing (`specs/12-cli.md`) or command wiring.
- Simulator game-loop execution changes.
- New agent families or alias names.
- Config syntax beyond comma-separated types.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/agents/factory-api-shape.test.ts`
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

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Reassessed ticket assumptions and aligned scope to the existing implementation in `src/agents/factory.ts`.
  - Strengthened parse-spec coverage in `test/unit/agents/factory-api-shape.test.ts` for:
    - ordered normalized parsing (`random` then `greedy`),
    - empty-token acceptance when count still matches (`random,,greedy` with `playerCount=2`),
    - post-filter count enforcement (`random,,greedy` with `playerCount=3`).
- **Deviations from plan**:
  - No source changes were needed in `src/agents/factory.ts` or `src/agents/index.ts`; existing behavior already satisfied requirements.
  - Extended the existing factory test file instead of creating a new `parse-agent-spec` test file.
- **Verification**:
  - `npm run lint`
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
  - `npm test`
