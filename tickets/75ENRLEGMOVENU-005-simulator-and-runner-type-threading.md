# 75ENRLEGMOVENU-005: Thread ClassifiedMove Through Simulator & Runner

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — simulator.ts; Runner changes are type-only
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md, archive/tickets/75ENRLEGMOVENU-003-skip-move-validation-threading.md, tickets/75ENRLEGMOVENU-004-agent-and-prepare-playable-moves-update.md

## Problem

The simulator and runner both participate in the agent-move pipeline. After ticket `004`, agents will consume `ClassifiedMove[]`, which means the simulator and runner must source classified moves from `enumerateLegalMoves()` where they feed agents, while preserving raw `legalMoves()` for callers that only need `Move[]`. The simulator also gains the `skipMoveValidation: true` optimization for its `applyMove` calls.

## Assumption Reassessment (2026-03-22)

1. `simulator.ts` currently calls raw `legalMoves()` and passes that result to `agent.chooseMove(...)`. That assumption is now stale: after ticket `004`, the simulator must call `enumerateLegalMoves()` and pass its classified `moves`.
2. `simulator.ts` still uses `legal.length` for logging and `applyMove(...)` without `skipMoveValidation`. Both remain this ticket's responsibility.
3. `game-worker-api.ts` already exposes both `legalMoves()` and `enumerateLegalMoves()`. Runner code that feeds agents should continue using the classified `enumerateLegalMoves()` path rather than forcing `legalMoves()` to change shape.
4. `ai-move-policy.ts:27-35` — `SelectAgentMoveInput.legalMoves: readonly Move[]` still changes to `readonly ClassifiedMove[]`.
5. `agent-turn-orchestrator.ts:23-29` — `ResolveAgentTurnStepInput.legalMoves: readonly Move[]` still changes to `readonly ClassifiedMove[]`.
6. Runner types are consumed by the store/worker — structured clone remains safe since `ClassifiedMove` is a plain object and ticket `002` filters out true probe rejections before they reach this boundary.

## Architecture Check

1. Simulator change is not a passive type-flow update anymore. It must switch from the raw `legalMoves()` facade to `enumerateLegalMoves()` at the agent boundary, while preserving raw move usage elsewhere.
2. Runner changes should stay focused on agent-facing/store-facing types. UI layers should continue receiving unwrapped `Move` objects where that is the established boundary.
3. `ClassifiedMove` crosses the Comlink worker boundary via structured clone — it's a plain object with no functions or class instances. Ticket `002` already guarantees only viable classified results cross this boundary.
4. This ticket is intentionally limited to the current Spec 75 shape, where the optimized execution handoff is still expressed via `skipMoveValidation`. Follow-up ticket `75ENRLEGMOVENU-007` owns replacing that public boolean with a dedicated trusted execution contract.

## What to Change

### 1. Update `simulator.ts`

- Replace the raw `legalMoves()` call with `enumerateLegalMoves()`.
- Pass `legalMoveResult.moves` to `agent.chooseMove(...)`.
- Preserve the existing `legalMoveCount` logging using `legalMoveResult.moves.length`.
- `applyMove` call: pass `{ ...options, skipMoveValidation: true }` as the options argument. This eliminates the 239ms redundant validation.

### 2. Update `game-worker-api.ts`

- Keep the split API explicit: `legalMoves()` stays `Move[]`, `enumerateLegalMoves()` stays `LegalMoveEnumerationResult` with `ClassifiedMove[]`.
- Update any stale imports/annotations only if they still assume raw enumerated moves at the worker boundary.

### 3. Update `ai-move-policy.ts`

- `SelectAgentMoveInput.legalMoves` → `readonly ClassifiedMove[]`
- Import `ClassifiedMove` from kernel types.
- Any internal code accessing moves from this input must use `.move` where a raw `Move` is needed.

### 4. Update `agent-turn-orchestrator.ts`

- `ResolveAgentTurnStepInput.legalMoves` → `readonly ClassifiedMove[]`
- Import `ClassifiedMove` from kernel types.
- Internal code that accesses individual moves must use `.move`.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify — type flow + skipMoveValidation)
- `packages/runner/src/worker/game-worker-api.ts` (modify — type annotations)
- `packages/runner/src/store/ai-move-policy.ts` (modify — input type)
- `packages/runner/src/store/agent-turn-orchestrator.ts` (modify — input type)

## Out of Scope

- Changing `enumerateLegalMoves` or `legalMoves` contracts themselves (ticket 002)
- Changing agents or `preparePlayableMoves` (ticket 004)
- Changing `applyMove` internals (ticket 003)
- Runner UI components — they consume `Move` from the store, not `ClassifiedMove`
- Canvas or animation layers — they don't interact with legal moves

## Acceptance Criteria

### Tests That Must Pass

1. `runGame` in simulator passes `skipMoveValidation: true` to `applyMove` — verified by test or code inspection
2. `runGame` produces identical `GameTrace` with and without `skipMoveValidation` for the same seed
3. `runGame` sources agent input from `enumerateLegalMoves().moves`, not from raw `legalMoves()`
4. `SelectAgentMoveInput` accepts `ClassifiedMove[]` without type errors
5. `ResolveAgentTurnStepInput` accepts `ClassifiedMove[]` without type errors
6. Existing suite: `pnpm turbo test` — all simulator and runner tests pass
7. Existing suite: `pnpm turbo typecheck` — no type errors across both packages

### Invariants

1. `skipMoveValidation: true` is ONLY set by the simulator for moves coming from its own classified enumeration on the same state — no other caller sets it.
2. `GameTrace` output is identical regardless of `skipMoveValidation` — this is a pure perf optimization.
3. Runner store types accept `ClassifiedMove[]` but runner UI components continue to receive unwrapped `Move` objects from the store.
4. Determinism: same seed + same agents = identical trace (Foundation 5).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — verify `skipMoveValidation` is passed to `applyMove`; verify trace parity
2. `packages/runner/test/store/ai-move-policy.test.ts` — update fixtures to `ClassifiedMove[]` if applicable
3. `packages/runner/test/store/agent-turn-orchestrator.test.ts` — update fixtures to `ClassifiedMove[]` if applicable

### Commands

1. `pnpm turbo test` — full test suite passes
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors
