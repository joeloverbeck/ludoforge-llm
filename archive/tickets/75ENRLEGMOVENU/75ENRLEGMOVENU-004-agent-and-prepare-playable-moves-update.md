# 75ENRLEGMOVENU-004: Finish Agent ClassifiedMove Adoption

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agent interface and agent-side move preparation
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-001-classifiedmove-type-and-always-complete-actions.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md

## Problem

Spec 75’s classification infrastructure is already present in the kernel: `ClassifiedMove`, `alwaysCompleteActionIds`, enriched `enumerateLegalMoves()`, and `skipMoveValidation` all exist. The remaining engine-side gap is that the public `Agent.chooseMove` contract still accepts raw `Move[]`, and `preparePlayableMoves` still re-probes viability instead of consuming the classified result that Spec 75 now produces.

This ticket owns finishing the agent boundary cleanly. It does not own simulator or runner threading; those remain in ticket `005`.

## Assumption Reassessment (2026-03-22)

1. `ClassifiedMove` is already defined in `packages/engine/src/kernel/types-core.ts`, and `LegalMoveEnumerationResult.moves` already returns `readonly ClassifiedMove[]`.
2. `legalMoves()` intentionally still returns raw `Move[]`; that split is correct and should remain. The classified boundary is `enumerateLegalMoves()`, not `legalMoves()`.
3. `Agent.chooseMove` in `types-core.ts` still declares `legalMoves: readonly Move[]`. This is the main contract mismatch left after ticket `002`.
4. `preparePlayableMoves` still imports and calls `probeMoveViability` for every input move, despite classified viability already being available.
5. `RandomAgent`, `GreedyAgent`, and `PolicyAgent` all delegate classification-sensitive behavior through `preparePlayableMoves`, so the viable architectural change remains centralized there.
6. `PreparedPlayableMoves.completedMoves` and `.stochasticMoves` should continue returning raw `Move[]`. The wrapper is an input-side optimization and should not leak deeper into agent internals than necessary.
7. `packages/engine/test/unit/prepare-playable-moves.test.ts` already exists and is the right test home for this ticket’s direct regression coverage. The ticket’s earlier reference to a non-existent `packages/engine/test/unit/agents/prepare-playable-moves.test.ts` was incorrect.
8. Simulator and runner still use raw `Move[]` at their agent-facing boundaries. That work belongs to ticket `005`, which explicitly depends on this ticket.

## Architecture Check

1. The public agent interface is the source of truth. Once it changes to `readonly ClassifiedMove[]`, all engine-side callers and tests that hand agents legal moves must be updated in the same change per Foundation 9.
2. `preparePlayableMoves` should become a consumer of precomputed classification, not a second classifier. Removing `probeMoveViability` from that file reduces coupling and eliminates the redundant hot path without changing downstream move execution semantics.
3. The right boundary is asymmetric by design: raw callers can keep using `legalMoves()`, while the agent pipeline consumes classified moves from `enumerateLegalMoves()`. This separation is cleaner than trying to make both APIs serve both needs.
4. Template-completion remains valuable even after classified enumeration. Classified viability tells the agent whether a move is complete, pending, or stochastic; `evaluatePlayableMoveCandidate` still owns concretizing pending template moves into executable `Move` values.
5. `PreparedPlayableMoves` should stay raw `Move[]`. Widening that return type to `ClassifiedMove[]` would add wrapper churn without architectural value because agents evaluate and execute concrete moves, not classification envelopes.

## What to Change

### 1. Update `Agent.chooseMove` input type in `types-core.ts`

```typescript
readonly legalMoves: readonly ClassifiedMove[];  // was: readonly Move[]
```

Use the existing in-file `ClassifiedMove` type. Do not create a parallel alias or compatibility type.

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
- Preserve the existing free-operation zone-filter mismatch fallthrough, but drive it from the classified viability payload instead of re-probing.

### 3. Update `RandomAgent` in `random-agent.ts`

- `chooseMove` input type flows from `Agent` interface.
- The file should not need behavioral changes beyond accommodating the stricter input contract, because selection still happens on `Move[]` returned by `preparePlayableMoves`.

### 4. Update `GreedyAgent` in `greedy-agent.ts`

- Same pattern as RandomAgent. Type flows from `Agent`.
- Keep scoring/execution logic operating on completed raw `Move[]`.

### 5. Update `PolicyAgent` in `policy-agent.ts`

- Same pattern as RandomAgent. Type flows from `Agent`.
- Preserve the existing policy-eval boundary where policy evaluation receives raw playable `Move[]` after preparation.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — Agent.chooseMove input type)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — remove probeMoveViability, read from viability)
- `packages/engine/src/agents/random-agent.ts` (verify — type flow adjustment only if needed)
- `packages/engine/src/agents/greedy-agent.ts` (verify — type flow adjustment only if needed)
- `packages/engine/src/agents/policy-agent.ts` (verify — type flow adjustment only if needed)
- `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify — classified-input regression coverage)
- `packages/engine/test/unit/agents/random-agent.test.ts` (modify — classified-input fixtures)
- `packages/engine/test/unit/agents/greedy-agent-core.test.ts` (modify — classified-input fixtures)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — classified-input fixtures)

## Out of Scope

- Changing `enumerateLegalMoves` or `legalMoves` contracts themselves (ticket 002)
- Changing `skipMoveValidation` or `applyMove` threading (ticket 003 / ticket 005)
- Changing simulator sourcing to `enumerateLegalMoves()` (ticket 005)
- Changing runner store/worker typing to `ClassifiedMove[]` (ticket 005)
- Modifying `probeMoveViability` function itself — it stays exported for direct callers
- Changing `PreparedPlayableMoves` return type — stays `readonly Move[]`

## Acceptance Criteria

### Tests That Must Pass

1. `Agent.chooseMove` accepts `readonly ClassifiedMove[]` at the engine boundary.
2. `preparePlayableMoves` with complete `ClassifiedMove` input adds `classified.move` to `completedMoves`.
3. `preparePlayableMoves` with stochastic `ClassifiedMove` input adds `classified.move` to `stochasticMoves`.
4. `preparePlayableMoves` with pending `ClassifiedMove` input still invokes template completion and can produce playable raw moves.
5. `preparePlayableMoves` does not import or call `probeMoveViability`.
6. `RandomAgent`, `GreedyAgent`, and `PolicyAgent` all accept classified input and still return executable raw `Move` results.
7. Existing engine agent and simulator tests continue to pass with the new contract.
8. Validation gates: `pnpm turbo test`, `pnpm turbo typecheck`, and `pnpm turbo lint`.

### Invariants

1. `probeMoveViability` is not called anywhere in `prepare-playable-moves.ts`.
2. Agent return type stays unchanged: agents still return concrete `Move` values plus `rng` and optional trace metadata.
3. `PreparedPlayableMoves` remains the raw execution boundary: `completedMoves` and `stochasticMoves` are `readonly Move[]`.
4. The split API remains intact: `legalMoves()` is raw, `enumerateLegalMoves()` is classified.
5. All three agents remain game-agnostic (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/prepare-playable-moves.test.ts` — supply `ClassifiedMove[]` fixtures and keep the free-operation template regression covered through classified viability
2. `packages/engine/test/unit/agents/random-agent.test.ts` — update fixtures to classified input
3. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — update fixtures to classified input
4. `packages/engine/test/unit/agents/policy-agent.test.ts` — update fixtures to classified input
5. `packages/engine/test/unit/sim/simulator.test.ts` — no new ownership here, but keep it green because the simulator is the next dependent consumer in ticket `005`

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass uncached for the affected package
2. `pnpm turbo test` — workspace tests pass
3. `pnpm turbo typecheck` — no type errors
4. `pnpm turbo lint` — no lint errors

## Outcome

What changed versus the original plan:

1. The ticketed agent-boundary work was completed as planned:
   - `Agent.chooseMove` now consumes `readonly ClassifiedMove[]`
   - `preparePlayableMoves` now consumes precomputed viability instead of re-probing each move
   - agent tests and fixtures were updated to use truthful classified inputs
2. The simulator and runner threading had to be updated in the same implementation wave even though they were originally scoped to ticket `005`.
   - Once the public agent contract changed, leaving raw `Move[]` at those call sites was not a stable architecture or a passing workspace state
   - the simulator now sources agent input from `enumerateLegalMoves()` and applies selected moves with `skipMoveValidation: true`
   - the runner AI store/orchestrator path now threads `ClassifiedMove[]` into agent selection
3. Validation exposed a deeper architectural bug in the existing `alwaysCompleteActionIds` optimization:
   - synthesized card-event actions were being treated as inherently complete even when event content still required decisions
   - that fast path was corrected so card-event actions are always viability-probed instead of blindly marked complete
   - a kernel regression test now guards that invariant
4. The result is cleaner than the pre-ticket architecture:
   - the classified boundary is now consistent end-to-end for agent consumers
   - agent prep no longer duplicates kernel viability work
   - event-backed decision moves can no longer bypass classification and reach execution incomplete
