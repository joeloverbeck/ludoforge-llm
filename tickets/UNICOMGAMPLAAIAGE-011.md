# UNICOMGAMPLAAIAGE-011: MctsAgent Class + Factory Integration + Agent Spec Parsing

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — modify agents/factory.ts, agents/index.ts; new mcts-agent.ts
**Deps**: UNICOMGAMPLAAIAGE-001, UNICOMGAMPLAAIAGE-010

## Problem

The MCTS search loop must be wrapped in a class implementing the `Agent` interface, integrated into the agent factory, and supported by the agent spec parser (`mcts`, `mcts:N` syntax).

## Assumption Reassessment (2026-03-13)

1. `Agent` interface in `types-core.ts:1009-1018`: `chooseMove(input) → { move, rng }` — confirmed.
2. `AgentType` is currently `'random' | 'greedy'` — must add `'mcts'`.
3. `createAgent` in `factory.ts` takes `(type)` — must accept optional `MctsConfig`.
4. `parseAgentSpec` supports `random,greedy` — must add `mcts` and `mcts:N`.
5. `input.runtime` is optional `GameDefRuntime` — confirmed.

## Architecture Check

1. `MctsAgent` wraps search loop, handles RNG isolation (`fork`), runtime building, single-move short-circuit.
2. Factory gets a union type update and optional config parameter — backwards compatible.
3. Agent spec parsing extends string matching — no breaking changes.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/mcts-agent.ts`

- `MctsAgent` class implementing `Agent`:
  - Constructor takes `Partial<MctsConfig>`, validates via `validateMctsConfig`.
  - `chooseMove(input)`:
    1. If `legalMoves.length === 1`, return immediately.
    2. Build `runtime` from `input.runtime ?? buildGameDefRuntime(def)`.
    3. Fork RNG: `[searchRng, nextAgentRng] = fork(input.rng)`.
    4. Derive observation: `derivePlayerObservation(def, state, playerId)`.
    5. Create root node and node pool.
    6. Run search via `runSearch(...)`.
    7. Select root decision via `selectRootDecision(root, playerId)`.
    8. Return `{ move: bestChild.move, rng: nextAgentRng }`.

### 2. Modify `packages/engine/src/agents/factory.ts`

- Expand `AgentType` to `'random' | 'greedy' | 'mcts'`.
- `createAgent(type, config?)` adds `mcts` case returning `new MctsAgent(config)`.
- Update `isAgentType` to include `'mcts'`.
- `parseAgentSpec` supports:
  - `mcts` — default config
  - `mcts:1500` — sets `iterations` to 1500
  - Still validates player count.

### 3. Modify `packages/engine/src/agents/index.ts`

Add re-export for mcts module.

## Files to Touch

- `packages/engine/src/agents/mcts/mcts-agent.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` (new)
- `packages/engine/test/unit/agents/factory.test.ts` (modify — add mcts cases)

## Out of Scope

- Search internals (handled by tickets 001-010).
- Solver mode — ticket 014.
- Search presets — ticket 015.
- Runner integration (the runner already consumes agents via the factory).

## Acceptance Criteria

### Tests That Must Pass

1. `MctsAgent.chooseMove` with single legal move: returns that move immediately, minimal RNG consumption.
2. `MctsAgent.chooseMove` with multiple moves: returns a legal move.
3. **RNG isolation**: returned `rng` is independent of iteration count. `chooseMove` with `iterations: 10` and `iterations: 100` on same input returns same `rng`.
4. **Determinism**: same input + same RNG + same config → same chosen move.
5. **Input immutability**: input `GameState` is not mutated after `chooseMove`.
6. **Runtime reuse**: if `input.runtime` is provided, it is used (no redundant building).
7. `createAgent('mcts')` returns `MctsAgent` with default config.
8. `createAgent('mcts', { iterations: 500 })` returns `MctsAgent` with custom iterations.
9. `parseAgentSpec('mcts,random', 2)` returns `[MctsAgent, RandomAgent]`.
10. `parseAgentSpec('mcts:500,greedy', 2)` returns `[MctsAgent(iterations:500), GreedyAgent]`.
11. `parseAgentSpec('mcts', 2)` throws (wrong player count).
12. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `MctsAgent` implements `Agent` interface exactly — same signature, same return type.
2. Factory is backwards-compatible: existing `random`/`greedy` calls unchanged.
3. Internal search RNG is never leaked through the returned `rng`.
4. `chooseMove` always returns a move from the input `legalMoves`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — single-move shortcut, determinism, RNG isolation, input immutability, runtime reuse.
2. `packages/engine/test/unit/agents/factory.test.ts` — add `mcts` and `mcts:N` spec parsing tests.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/mcts-agent.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/factory.test.ts`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
