# 75ENRLEGMOVENU-002: Classify Enumerated Legal Moves

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal move enumeration result shape, classification logic, direct enumeration consumers
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-001-classifiedmove-type-and-always-complete-actions.md

## Problem

`enumerateLegalMoves` still exposes only raw `Move[]`, so any consumer that needs move viability or completeness must re-probe downstream. That duplicates work and puts classification knowledge in the wrong layer.

However, the original ticket overstated the safety and locality of the change:

- `legalMoves()` has a broad raw-move consumer surface across the engine and tests. Forcing every caller onto `ClassifiedMove` just to preserve one optimization path is not a cleaner boundary.
- `probeMoveViability` is not a perfect enumeration-time legality filter for incomplete templates. Free-operation templates can hit a provisional `zoneFilterMismatch` denial that later resolves during template completion.
- `enumerateLegalMoves` does not currently accept a profiler, so adding `classifyMoves` spans here would widen the API for little architectural value.

This ticket should therefore make the rich enumeration result authoritative while preserving `legalMoves()` as the explicit raw `Move[]` projection.

## Assumption Reassessment (2026-03-22)

1. `ClassifiedMove` and `GameDefRuntime.alwaysCompleteActionIds` already exist from ticket `001`. This ticket should consume that infrastructure, not rebuild it.
2. `LegalMoveEnumerationResult` in `packages/engine/src/kernel/legal-moves.ts` still exposes `moves: readonly Move[]` and is the correct place to introduce `ClassifiedMove[]`.
3. `legalMoves()` is used pervasively by engine tests and raw-move consumers. Changing it to `ClassifiedMove[]` in this ticket would create wrapper churn in code that does not need viability metadata.
4. `enumerateLegalMoves()` does not currently accept or thread a profiler. The original `perfStart/perfEnd` requirement was based on stale assumptions and is removed from this ticket.
5. `probeMoveViability()` can reject some incomplete free-operation templates with `freeOperationNotGranted` / `zoneFilterMismatch`, even though template completion can later produce a playable move. Those moves must not be filtered out as definitively illegal during enumeration.
6. The real direct-consumer surface for `LegalMoveEnumerationResult` includes runner worker/store/model code and worker tests, not just kernel tests.

## Architecture Reassessment

1. Move classification belongs at the legal-move enumeration boundary. That is the canonical place where raw move templates are produced and where always-complete fast-path metadata can be applied once.
2. `legalMoves()` should remain the intentionally raw API for callers that only need `Move`. That is not a backwards-compat shim; it is the correct boundary for broad raw-move consumers across the engine.
3. Enumeration-time classification must be conservative. It may fast-path always-complete actions and filter truly rejected probes, but it must preserve deferred templates whose rejection is only provisional before completion.
4. The clean contract for `LegalMoveEnumerationResult.moves` is `readonly ClassifiedMove[]` with `viability.viable === true` for every returned element. Any probe result that would be filtered but is known to be completion-deferred should be converted into a synthetic incomplete viability result instead of leaking a rejected probe result over the boundary.

## What to Change

### 1. Update `LegalMoveEnumerationResult` in `packages/engine/src/kernel/legal-moves.ts`

```typescript
export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];
  readonly warnings: readonly RuntimeWarning[];
}
```

`MoveEnumerationState.moves` stays as raw `Move[]` during the enumeration phase. Classification happens after final move collection and turn-flow window filtering.

### 2. Classify final enumerated moves in `enumerateLegalMoves`

After the existing raw move collection completes:

- keep the current raw enumeration logic untouched
- run `applyTurnFlowWindowFilters(...)` to get the final raw `Move[]`
- classify each final move:
  - if `alwaysCompleteActionIds.has(move.actionId)`:
    - synthesize `{ viable: true, complete: true, move, warnings: [] }`
  - otherwise call `probeMoveViability(def, state, move, runtime)`
  - if the probe is viable, wrap it directly
  - if the probe is the known deferred free-operation template case:
    - preserve the move by synthesizing `{ viable: true, complete: false, move, warnings: [] }`
  - otherwise:
    - drop the move from the classified result
    - emit a runtime warning describing that enumeration produced a move later rejected by viability probing

The deferred-case predicate must cover the current regression shape already encoded in `preparePlayableMoves`:

- `move.freeOperation === true`
- probe result is `viable: false`
- `code === 'ILLEGAL_MOVE'`
- `context.reason === 'freeOperationNotGranted'`
- `context.freeOperationDenial.cause === 'zoneFilterMismatch'`

### 3. Keep `legalMoves()` as the raw API

`legalMoves()` should continue to return `readonly Move[]`, but it should do so through a shared raw-enumeration helper rather than by projecting classified results. That keeps the raw consumer path free from classification/probe overhead and preserves the existing engine semantics where callers explicitly asked for raw moves.

This ticket does not change the `legalMoves()` contract. The rich contract lives on `enumerateLegalMoves()` and `LegalMoveEnumerationResult`.

### 4. Add one new enumeration warning code

Add a dedicated runtime warning code for the probe-rejected enumeration mismatch, and thread it through the existing runtime warning schemas/types:

- `MOVE_ENUM_PROBE_REJECTED`

This warning is only for true enumeration/probe disagreement. The deferred free-operation template case should not warn, because it is an intentional completion-time deferral rather than a mismatch.

### 5. Update direct `enumerateLegalMoves()` consumers

Because `LegalMoveEnumerationResult.moves` changes shape, update direct consumers that currently expect raw `Move` objects:

- runner worker/store/model code that reads `legalMoveResult.moves`
- runner tests that construct `LegalMoveEnumerationResult` fixtures
- kernel/integration tests that inspect `enumerateLegalMoves(...).moves`

Consumers that only need raw moves should project `classified.move`.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/runner/src/model/derive-runner-frame.ts`
- `packages/runner/src/store/game-store.ts`
- tests that consume `LegalMoveEnumerationResult` directly

## Out of Scope

- Changing `Agent.chooseMove` to accept `ClassifiedMove[]` (future ticket)
- Rewriting `preparePlayableMoves` to consume classified enumeration output directly (future ticket)
- Adding `skipMoveValidation` to `ExecutionOptions`
- Adding profiler plumbing to `enumerateLegalMoves`
- Changing `probeMoveViability()` semantics beyond handling its known deferred result conservatively at enumeration time

## Acceptance Criteria

### Tests That Must Pass

1. `enumerateLegalMoves()` returns `ClassifiedMove[]`
2. Always-complete actions get synthetic `{ viable: true, complete: true }` results without probing
3. Non-always-complete actions get their viability from `probeMoveViability()`
4. Free-operation templates rejected only because of `zoneFilterMismatch` remain in the enumerated result as incomplete classified moves
5. Truly rejected probe results are filtered from `LegalMoveEnumerationResult.moves` and emit `MOVE_ENUM_PROBE_REJECTED`
6. `legalMoves()` still returns raw `Move[]`
7. Runner worker/store/model code continues to work by projecting `classified.move`
8. Existing suites: `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test`

### Invariants

1. Every returned `ClassifiedMove` has `viability.viable === true`
2. `legalMoves()` remains a pure raw-enumeration API and does not depend on the classified result shape
3. Enumeration preserves deferred template moves rather than falsely hardening them into illegality
4. Move ordering remains stable after classification and filtering

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - expect `enumerateLegalMoves(...).moves` to contain `ClassifiedMove`
   - cover always-complete fast-path
   - cover probe-rejected filtering + warning
2. `packages/engine/test/unit/prepare-playable-moves.test.ts`
   - strengthen the existing seed-11 regression by asserting `enumerateLegalMoves()` preserves the deferred free-operation template instead of dropping it
3. Runner worker/model/store tests that construct or inspect `LegalMoveEnumerationResult`
   - update fixtures and direct move access to use `.move`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`

## Outcome

Implemented with one architectural correction relative to the original plan:

- `LegalMoveEnumerationResult.moves` now returns `ClassifiedMove[]`, and `enumerateLegalMoves()` performs conservative classification after raw enumeration.
- `legalMoves()` intentionally remains on the raw path through a shared internal raw-enumeration helper instead of projecting classified results. This proved cleaner than forcing the raw API through probing/classification work it does not need.
- Added `MOVE_ENUM_PROBE_REJECTED` to the runtime warning surface and synchronized schema artifacts.
- Preserved the known deferred free-operation `zoneFilterMismatch` case as an incomplete viable classified move instead of falsely filtering it out.
- Updated direct runner and test consumers to project `classified.move` where they only need raw moves.
