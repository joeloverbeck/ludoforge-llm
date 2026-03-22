# 75ENRLEGMOVENU-005: Thread ClassifiedMove Through Simulator & Runner

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — simulator.ts; Runner changes are type-only
**Deps**: tickets/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md, tickets/75ENRLEGMOVENU-003-skip-move-validation-threading.md, tickets/75ENRLEGMOVENU-004-agent-and-prepare-playable-moves-update.md

## Problem

The simulator and runner both consume `legalMoves` output and pass it to agents. With Spec 75, the type changes from `Move[]` to `ClassifiedMove[]`. The simulator also gains the `skipMoveValidation: true` optimization for its `applyMove` calls.

## Assumption Reassessment (2026-03-22)

1. `simulator.ts:111-117` — `legalMoves()` call returns value stored and passed to agent. Return type change flows naturally.
2. `simulator.ts:142` — `applyMove` call does not currently pass `skipMoveValidation`. Must add it.
3. `game-worker-api.ts` imports `Move`, `LegalMoveEnumerationResult` — may need `ClassifiedMove` import.
4. `ai-move-policy.ts:27-35` — `SelectAgentMoveInput.legalMoves: readonly Move[]` — changes to `readonly ClassifiedMove[]`.
5. `agent-turn-orchestrator.ts:23-29` — `ResolveAgentTurnStepInput.legalMoves: readonly Move[]` — changes to `readonly ClassifiedMove[]`.
6. Runner types are consumed by the store/worker — structured clone safe since `ClassifiedMove` is a plain object.

## Architecture Check

1. Simulator change is mechanical — `legalMoves()` return type flows to agent, and `skipMoveValidation` is added to `applyMove` options.
2. Runner changes are type-only — no behavioral change, just updating `Move[]` → `ClassifiedMove[]` in interfaces.
3. `ClassifiedMove` crosses the Comlink worker boundary via structured clone — it's a plain object with no functions or class instances. Non-viable results (which may contain `KernelRuntimeError` instances) are filtered out by `enumerateLegalMoves` before reaching the runner.

## What to Change

### 1. Update `simulator.ts`

- `legalMoves()` return type is now `readonly ClassifiedMove[]` — the variable storing it needs the correct type.
- Agent `chooseMove` call: `legalMoves` field already passes the return value — type flows naturally.
- `applyMove` call: pass `{ ...options, skipMoveValidation: true }` as the options argument. This eliminates the 239ms redundant validation.

### 2. Update `game-worker-api.ts`

- If `legalMoves` or `enumerateLegalMoves` results are exposed to the runner, update imports and return type annotations to use `ClassifiedMove`.
- Ensure `ClassifiedMove` is imported from the kernel.

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

- Changing `enumerateLegalMoves` or `legalMoves` (ticket 002)
- Changing agents or `preparePlayableMoves` (ticket 004)
- Changing `applyMove` internals (ticket 003)
- Runner UI components — they consume `Move` from the store, not `ClassifiedMove`
- Canvas or animation layers — they don't interact with legal moves

## Acceptance Criteria

### Tests That Must Pass

1. `runGame` in simulator passes `skipMoveValidation: true` to `applyMove` — verified by test or code inspection
2. `runGame` produces identical `GameTrace` with and without `skipMoveValidation` for the same seed
3. `SelectAgentMoveInput` accepts `ClassifiedMove[]` without type errors
4. `ResolveAgentTurnStepInput` accepts `ClassifiedMove[]` without type errors
5. Existing suite: `pnpm turbo test` — all simulator and runner tests pass
6. Existing suite: `pnpm turbo typecheck` — no type errors across both packages

### Invariants

1. `skipMoveValidation: true` is ONLY set by the simulator for moves from its own `legalMoves` call — no other caller sets it.
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
