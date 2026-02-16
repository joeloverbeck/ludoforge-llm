# Spec 36: Game Kernel Web Worker Bridge

**Status**: ACTIVE
**Priority**: P0 (critical path)
**Complexity**: M
**Dependencies**: Spec 35 (Monorepo Restructure)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Section 10 (Simulation on worker thread)

---

## Objective

Wrap the kernel's public API in a Web Worker using Comlink, providing a typed async RPC interface from the main thread. The worker owns the GameState; the main thread sends commands and receives state snapshots + effect traces via structured clone.

**Success criteria**: Main thread can initialize a game, enumerate legal moves, apply moves, and detect terminal state — all via async calls to the worker, with full TypeScript types preserved.

---

## Constraints

- The kernel code itself is NOT modified. The worker is a thin wrapper.
- All data crossing the worker boundary must be structured-clone compatible (no functions, no classes with methods, no circular references). GameState, Move, EffectTraceEntry, and GameDef are all plain objects — verify this.
- Error propagation: kernel errors (illegal move, invalid state) must propagate as rejected promises on the main thread.
- Worker must be instantiable multiple times (for future parallel game evaluation).

---

## Architecture

```
Main Thread                          Web Worker
─────────────────                    ──────────────────
GameBridge (Comlink wrap)  ──msg──>  GameWorker (Comlink expose)
  .init(gameDef, seed)                 calls initialState(def, seed)
  .legalMoves()                        calls legalMoves(def, state)
  .legalChoices(partialMove)           calls legalChoices(def, state, partial)
  .applyMove(move)                     calls applyMove(def, state, move)
  .terminalResult()                    calls terminalResult(def, state)
  .getState()                          returns current state snapshot
  .undo()                              pops state history stack
```

---

## Deliverables

### D1: Worker Entry Point

`packages/runner/src/worker/game-worker.ts`

Exposes the kernel API via Comlink:

```typescript
import { expose } from 'comlink';
import {
  initialState,
  legalMoves,
  legalChoices,
  applyMove,
  terminalResult,
} from '@ludoforge/engine';
import type { GameDef, GameState, Move, EffectTraceEntry } from '@ludoforge/engine';

interface ApplyMoveResult {
  readonly state: GameState;
  readonly trace: readonly EffectTraceEntry[];
}

const gameWorker = {
  // Internal state
  _def: null as GameDef | null,
  _state: null as GameState | null,
  _history: [] as GameState[],

  init(def: GameDef, seed: bigint | number) {
    this._def = def;
    this._state = initialState(def, seed);
    this._history = [];
    return this._state;
  },

  legalMoves() { /* delegates to kernel legalMoves(def, state) */ },
  legalChoices(partialMove: Partial<Move>) { /* delegates to kernel */ },

  applyMove(move: Move): ApplyMoveResult {
    // Push current state to history before applying
    // Call kernel applyMove, update internal state
    // Return { state, trace }
  },

  terminalResult() { /* delegates to kernel */ },
  getState() { return this._state; },

  undo(): GameState | null {
    // Pop from history, return previous state or null if empty
  },
};

expose(gameWorker);
```

### D2: Main-Thread Bridge

`packages/runner/src/bridge/game-bridge.ts`

Wraps the worker with Comlink and provides typed async interface:

```typescript
import { wrap, type Remote } from 'comlink';
import type { GameDef, GameState, Move } from '@ludoforge/engine';

export type GameBridge = Remote<typeof import('../worker/game-worker').gameWorker>;

export function createGameBridge(): GameBridge {
  const worker = new Worker(
    new URL('../worker/game-worker.ts', import.meta.url),
    { type: 'module' }
  );
  return wrap(worker);
}
```

### D3: Structured Clone Verification

Unit tests that verify all kernel types survive structured clone:

- `GameState` round-trips through `structuredClone()`
- `Move` round-trips through `structuredClone()`
- `EffectTraceEntry[]` round-trips through `structuredClone()`
- `GameDef` round-trips through `structuredClone()`
- `ChoicePendingRequest` round-trips through `structuredClone()`
- `TerminalResult` round-trips through `structuredClone()`

If any type contains non-cloneable values (functions, symbols, class instances), document and resolve before proceeding.

### D4: Worker Initialization with GameDef Loading

The bridge must support loading a GameDef from:
1. A pre-compiled JSON object (passed directly)
2. A URL (fetched in the worker, parsed as JSON)

The worker validates the GameDef on load using the engine's validation function.

### D5: Error Propagation

- Kernel errors (e.g., applying an illegal move) reject the promise with a descriptive error message.
- Worker crashes (uncaught exceptions) are caught by the main thread's `worker.onerror` handler.
- Type: errors are serialized as plain objects (not Error instances) since Error doesn't structured-clone cleanly across all browsers.

### D6: Unit Tests

Test file: `packages/runner/test/worker/game-bridge.test.ts`

Tests (can use a small test GameDef fixture or compile Texas Hold'em):
- [ ] `init()` returns a valid GameState
- [ ] `legalMoves()` returns non-empty array for initial state
- [ ] `applyMove()` returns new state + effect trace
- [ ] `undo()` restores previous state
- [ ] `undo()` on initial state returns null
- [ ] `terminalResult()` returns null for non-terminal state
- [ ] Error propagation for invalid move
- [ ] Multiple sequential moves produce correct state progression

---

## Implementation Notes

### Vite Worker Support

Vite handles Web Workers natively with `new Worker(new URL(...), { type: 'module' })`. No additional configuration needed. The worker file is bundled separately by Vite.

### BigInt Serialization

The kernel uses `bigint` for PRNG seeds and Zobrist hashes. `structuredClone()` supports BigInt. Verify that Comlink does not interfere with BigInt serialization.

### State History in Worker

The undo stack lives in the worker, not the main thread. This keeps the worker as the single source of truth for game state. The main thread can request undo, and the worker returns the restored state.

---

## Out of Scope

- AI agent integration (agents run on main thread or separate worker — decided in later specs)
- Multiplayer / networked play
- State persistence (handled by Spec 42 via Dexie.js)
- GameDef compilation (the runner consumes pre-compiled GameDef JSON)
