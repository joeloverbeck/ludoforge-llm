# GAMEARCH-003: Free-Op Grant Lifecycle and Consumption Model

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-001

## Description

Current consumption drops all pending grants for a faction on one free-op use. This prevents robust modeling of multiple independent grants for the same faction.

### What Must Change

1. Redesign pending grant runtime model to support per-grant consumption.
2. Consume only the grant(s) actually used by the applied move.
3. Add explicit policy fields if needed (for example `uses`, `consumeOn`), but keep model generic and game-agnostic.
4. Preserve deterministic ordering and serialization for runtime state hashing.

## Files to Touch

- `src/kernel/types-turn-flow.ts`
- `src/kernel/schemas-extensions.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/apply-move.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-event-free-operation-grants.test.ts`

## Out of Scope

- Eligibility override system migration.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests verify:
   - Multiple grants for same faction coexist.
   - One free-op move consumes only relevant grant instance(s).
   - Unused grants remain pending.
2. Integration tests verify two consecutive granted free ops can be modeled when two grants exist.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Runtime behavior is deterministic.
- Grant lifecycle is explicit, typed, and data-driven.
- No hidden faction-wide blanket deletion side effects.
