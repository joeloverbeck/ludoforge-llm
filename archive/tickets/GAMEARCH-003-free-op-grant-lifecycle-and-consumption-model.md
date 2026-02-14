# GAMEARCH-003: Free-Op Grant Lifecycle and Consumption Model

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-001

## Description

Current consumption drops all pending grants for a faction on one free-op use. This prevents robust modeling of multiple independent grants for the same faction.

### Reassessed Current State (2026-02-14)

- `pendingFreeOperationGrants` already exists as a runtime array of grant objects (`faction`, optional `actionIds`, optional `zoneFilter`).
- Consumption is still faction-wide:
  - `consumeTurnFlowFreeOperationGrant` removes all grants for the active faction (`grant.faction !== activeFaction` filter).
  - This violates per-grant lifecycle semantics.
- Grant accumulation currently deduplicates by serialized payload:
  - `dedupePendingFreeOperationGrants` collapses identical grants into one.
  - This prevents representing two independent but structurally identical grants (for example, two separate grant sources that should allow two uses).
- Free-op authorization already has strong validation layers:
  - Discovery/applicability (`isFreeOperationApplicableForMove`)
  - Final authorization with `zoneFilter` (`isFreeOperationGrantedForMove`)
- `applyMove` intentionally skips turn-flow eligibility transitions for free-op execution and invokes explicit grant consumption instead; this behavior remains in scope and should stay deterministic.

### What Must Change

1. Treat `pendingFreeOperationGrants` as a deterministic multiset (do not collapse identical entries).
2. Consume exactly one authorizing grant instance for each applied free-op move.
3. Authorizing-grant consumption must respect the same authorization semantics used for legality (including `actionIds` and `zoneFilter`).
4. Keep compiler/runtime model generic and game-agnostic; do not introduce game-specific branches.
5. Preserve deterministic ordering and serialization for runtime state hashing.
6. No backwards-compatibility aliasing paths.

## Files to Touch

- `src/kernel/apply-move.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-event-free-operation-grants.test.ts`

## Out of Scope

- Eligibility override system migration.
- Event payload schema redesign beyond fields required for per-grant lifecycle behavior.
- Game-specific free-op semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests verify:
   - Multiple grants for same faction coexist, including structurally identical grants.
   - One free-op move consumes exactly one relevant grant instance.
   - Unused grants remain pending.
2. Integration tests verify two consecutive granted free ops can be modeled when two grants exist for the same faction.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Runtime behavior is deterministic.
- Grant lifecycle is explicit, typed, and data-driven.
- No hidden faction-wide blanket deletion side effects.

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Removed pending free-op grant deduplication so identical grant instances can coexist as independent uses.
  - Updated free-op grant consumption to remove exactly one deterministic authorizing grant instance (first matching by pending order), respecting `actionIds` and `zoneFilter`.
  - Removed faction-wide blanket pending-grant deletion from turn-flow post-move accumulation.
  - Updated free-op turn-flow handling in `applyMove` so grant consumption is keyed to `move.freeOperation === true` (grant usage), not pipeline presence.
  - Added tests for per-grant consumption and consecutive same-faction free-op usage.
- **Deviation from original plan**:
  - `src/kernel/schemas-extensions.ts` and `src/kernel/types-turn-flow.ts` were not changed; existing generic schema/type shape was already sufficient for per-instance lifecycle.
  - `src/kernel/apply-move.ts` was updated (not originally in the reassessed file list) to align consumption trigger semantics with free-op usage.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
