# 75ENRLEGMOVENU-004: Update Agents & preparePlayableMoves for ClassifiedMove

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent interface, all agent implementations, preparePlayableMoves
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-001-classifiedmove-type-and-always-complete-actions.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md

## Problem

The `Agent.chooseMove` interface receives `legalMoves: readonly Move[]`. With Spec 75, this becomes `readonly ClassifiedMove[]`. All agent implementations and `preparePlayableMoves` must consume the pre-computed viability instead of calling `probeMoveViability` redundantly.

This is the ticket that owns the remaining architectural step identified after ticket `002`: `preparePlayableMoves` should stop re-deriving move viability and instead consume the classified enumeration result directly.

## Assumption Reassessment (2026-03-22)

1. `Agent.chooseMove` input at `types-core.ts:1493-1501` still has `legalMoves: readonly Move[]` — this ticket changes it to `readonly ClassifiedMove[]`.
2. Ticket `002` changed `enumerateLegalMoves()` and `LegalMoveEnumerationResult.moves` to return `ClassifiedMove[]`, but intentionally left `legalMoves()` raw. Agent inputs must therefore be sourced from classified enumeration, not from the raw `legalMoves()` facade.
3. `preparePlayableMoves` at `prepare-playable-moves.ts` currently uses `Pick<..., 'legalMoves' | ...>` — the type will flow from the `Agent` interface once that interface changes.
4. `preparePlayableMoves` still calls `probeMoveViability` for each move — this is the hotspot this ticket is meant to eliminate.
5. `RandomAgent.chooseMove`, `GreedyAgent.chooseMove`, and `PolicyAgent.chooseMove` all route through `preparePlayableMoves`, so the type/behavior change should stay centralized there.
6. `PreparedPlayableMoves.completedMoves` and `.stochasticMoves` should remain `readonly Move[]` — agents consume classified input but still act on raw selected moves.

## Architecture Check

1. The Agent interface change is a breaking change — Foundation 9 requires all consumers updated in the same change. This ticket handles all agent-side consumers.
2. `preparePlayableMoves` becomes a pure classifier reader — no `probeMoveViability` import needed. Simpler, faster, less coupling.
3. Agents that need the raw `Move` extract it via `.move` — the `ClassifiedMove` wrapper is transparent.
4. The clean boundary is: raw callers keep using `legalMoves()`, while the agent pipeline consumes `enumerateLegalMoves()` output. This ticket should not try to collapse those two APIs back together.

## What to Change

### 1. Update `Agent.chooseMove` input type in `types-core.ts`

```typescript
readonly legalMoves: readonly ClassifiedMove[];  // was: readonly Move[]
```

Import `ClassifiedMove` (or use the inline `import()` pattern already used for other types in this interface).

### 2. Rewrite `preparePlayableMoves` in `prepare-playable-moves.ts`

- Change `input.legalMoves` type to `readonly ClassifiedMove[]` (flows from Agent interface Pick).
- Remove the `import { probeMoveViability } from '../kernel/apply-move.js'` import.
- Replace the per-move `probeMoveViability` call with reading `classified.viability`:
  ```
  for each classified of input.legalMoves:
    if viability.viable && viability.complete:
      → add classified.move to completedMoves
    if viability.viable && !viability.complete && viability.stochasticDecision:
      → add classified.move to stochasticMoves
    if viability.viable && !viability.complete && !stochasticDecision:
      → pending template completion path (existing logic, using classified.move and classified.viability)
  ```
- `PreparedPlayableMoves` fields stay as `readonly Move[]` — we unwrap `.move` when adding to these arrays.

### 3. Update `RandomAgent` in `random-agent.ts`

- `chooseMove` input type flows from `Agent` interface — no explicit change if using `Parameters<Agent['chooseMove']>[0]`.
- If the agent directly accesses `input.legalMoves[i]` as a `Move`, update to `input.legalMoves[i].move`.
- The `preparePlayableMoves` call already returns `Move[]` in `.completedMoves` — downstream logic unchanged.

### 4. Update `GreedyAgent` in `greedy-agent.ts`

- Same pattern as RandomAgent. Type flows from Agent interface.
- Any direct `Move` access from `legalMoves` must use `.move`.

### 5. Update `PolicyAgent` in `policy-agent.ts`

- Same pattern as RandomAgent. Type flows from Agent interface.
- Any direct `Move` access from `legalMoves` must use `.move`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — Agent.chooseMove input type)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — remove probeMoveViability, read from viability)
- `packages/engine/src/agents/random-agent.ts` (modify — type flow adjustment)
- `packages/engine/src/agents/greedy-agent.ts` (modify — type flow adjustment)
- `packages/engine/src/agents/policy-agent.ts` (modify — type flow adjustment)

## Out of Scope

- Changing `enumerateLegalMoves` or `legalMoves` (ticket 002)
- Adding `skipMoveValidation` (ticket 003)
- Changing simulator or runner sourcing/threading of classified moves (ticket 005)
- Modifying `probeMoveViability` function itself — it stays exported for direct callers
- Changing `PreparedPlayableMoves` return type — stays `readonly Move[]`

## Acceptance Criteria

### Tests That Must Pass

1. `preparePlayableMoves` with complete `ClassifiedMove` input → move appears in `completedMoves`
2. `preparePlayableMoves` with stochastic `ClassifiedMove` input → move appears in `stochasticMoves`
3. `preparePlayableMoves` with pending `ClassifiedMove` input → template completion path is invoked
4. `preparePlayableMoves` does NOT import or call `probeMoveViability` — verified by grep
5. `RandomAgent.chooseMove` accepts `ClassifiedMove[]` and returns a valid `Move`
6. `GreedyAgent.chooseMove` accepts `ClassifiedMove[]` and returns a valid `Move`
7. `PolicyAgent.chooseMove` accepts `ClassifiedMove[]` and returns a valid `Move`
8. Existing suite: `pnpm turbo test` — all existing agent tests pass (with fixture updates for ClassifiedMove input)
9. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. `probeMoveViability` is NOT called anywhere in `prepare-playable-moves.ts` — the whole point of Spec 75.
2. Agent `chooseMove` return type is unchanged: `{ readonly move: Move; readonly rng: Rng; ... }` — agents unwrap `.move` from `ClassifiedMove`.
3. `PreparedPlayableMoves` fields remain `readonly Move[]` — downstream agent logic is unaffected.
4. All three agents remain game-agnostic (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves.test.ts` — rewrite to supply `ClassifiedMove[]` fixtures instead of raw `Move[]`, verify no `probeMoveViability` calls
2. `packages/engine/test/unit/agents/random-agent.test.ts` — update fixtures to `ClassifiedMove[]`
3. `packages/engine/test/unit/agents/greedy-agent.test.ts` — update fixtures to `ClassifiedMove[]`
4. `packages/engine/test/unit/agents/policy-agent.test.ts` — update fixtures if exists

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors
