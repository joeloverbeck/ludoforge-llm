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

**Success criteria**: Main thread can initialize a game, enumerate legal moves (with warnings), apply moves (with effect traces for animation), batch-apply move sequences, and detect terminal state — all via async calls to the worker, with full TypeScript types preserved.

---

## Constraints

- The kernel code itself is NOT modified. The worker is a thin wrapper.
- All data crossing the worker boundary must be structured-clone compatible (no functions, no classes with methods, no circular references). GameState, Move, EffectTraceEntry, ApplyMoveResult, and GameDef are all plain objects — verify this.
- Error propagation: kernel errors (illegal move, invalid state) must propagate as rejected promises on the main thread with structured error codes.
- Worker must be instantiable multiple times (for future parallel game evaluation).
- The bridge must import actual kernel types from `@ludoforge/engine` — never redefine them locally.

---

## Architecture

```
Main Thread                              Web Worker
─────────────────────                    ──────────────────────────────
createGameBridge()                       GameWorker (Comlink expose)
  → { bridge, terminate }
                                         Internal state:
GameBridge (Comlink wrap)  ──msg──>        _def, _state, _history[], _options
  .init(def, seed, options?)               calls initialState(def, seed, playerCount?)
  .legalMoves(options?)                    calls legalMoves(def, state, options?)
  .enumerateLegalMoves(options?)           calls enumerateLegalMoves(def, state, options?)
  .legalChoices(partialMove, options?)     calls legalChoices(def, state, partial, options?)
  .applyMove(move, options?)               calls applyMove(def, state, move, execOptions)
  .playSequence(moves, onStep?)            calls applyMove N times, streams results
  .terminalResult()                        calls terminalResult(def, state)
  .getState()                              returns current state snapshot
  .getMetadata()                           returns lightweight game metadata
  .getHistoryLength()                      returns undo stack depth
  .undo()                                  pops state history stack
  .reset(def?, seed?, options?)            reinitializes game, clears history
  .terminate()                             worker.terminate() from main thread
```

---

## Deliverables

### D1: Worker Entry Point

`packages/runner/src/worker/game-worker.ts`

Exposes the kernel API via Comlink. Uses actual kernel types — does not redefine them.

```typescript
import { expose } from 'comlink';
import {
  initialState,
  legalMoves,
  enumerateLegalMoves,
  legalChoices,
  applyMove,
  terminalResult,
} from '@ludoforge/engine';
import type {
  ApplyMoveResult,
  ChoiceRequest,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
  TerminalResult,
  LegalMoveEnumerationOptions,
  LegalMoveEnumerationResult,
} from '@ludoforge/engine';
import type { LegalChoicesOptions } from '@ludoforge/engine';

/** Lightweight metadata the main thread can query without the full GameDef. */
interface GameMetadata {
  readonly gameId: string;
  readonly playerCount: number;
  readonly phaseNames: readonly string[];
  readonly actionNames: readonly string[];
  readonly zoneNames: readonly string[];
}

/** Worker error shape — structured-clone safe, includes error code. */
interface WorkerError {
  readonly code: 'ILLEGAL_MOVE' | 'VALIDATION_FAILED' | 'NOT_INITIALIZED' | 'INTERNAL_ERROR';
  readonly message: string;
  readonly details?: unknown;
}

/** Options for bridge init. */
interface BridgeInitOptions {
  readonly playerCount?: number;
  readonly enableTrace?: boolean;
}

const toWorkerError = (code: WorkerError['code'], err: unknown): WorkerError => ({
  code,
  message: err instanceof Error ? err.message : String(err),
  details: err instanceof Error ? { name: err.name, stack: err.stack } : undefined,
});

const assertInitialized = (
  def: GameDef | null,
  state: GameState | null,
): { def: GameDef; state: GameState } => {
  if (def === null || state === null) {
    throw toWorkerError('NOT_INITIALIZED', 'Worker not initialized. Call init() first.');
  }
  return { def, state };
};

const gameWorker = {
  _def: null as GameDef | null,
  _state: null as GameState | null,
  _history: [] as GameState[],
  _enableTrace: true,

  init(def: GameDef, seed: number, options?: BridgeInitOptions): GameState {
    this._def = def;
    this._state = initialState(def, seed, options?.playerCount);
    this._history = [];
    this._enableTrace = options?.enableTrace !== false; // default true
    return this._state;
  },

  legalMoves(options?: LegalMoveEnumerationOptions): readonly Move[] {
    const { def, state } = assertInitialized(this._def, this._state);
    return legalMoves(def, state, options);
  },

  enumerateLegalMoves(options?: LegalMoveEnumerationOptions): LegalMoveEnumerationResult {
    const { def, state } = assertInitialized(this._def, this._state);
    return enumerateLegalMoves(def, state, options);
  },

  legalChoices(partialMove: Move, options?: LegalChoicesOptions): ChoiceRequest {
    const { def, state } = assertInitialized(this._def, this._state);
    return legalChoices(def, state, partialMove, options);
  },

  applyMove(move: Move, options?: { trace?: boolean }): ApplyMoveResult {
    const { def, state } = assertInitialized(this._def, this._state);
    this._history.push(state);
    const enableTrace = options?.trace ?? this._enableTrace;
    const execOptions: ExecutionOptions = { trace: enableTrace };
    try {
      const result = applyMove(def, state, move, execOptions);
      this._state = result.state;
      return result;
    } catch (err) {
      // Roll back history push on failure
      this._history.pop();
      throw toWorkerError('ILLEGAL_MOVE', err);
    }
  },

  playSequence(
    moves: readonly Move[],
    onStep?: (result: ApplyMoveResult, moveIndex: number) => void,
  ): readonly ApplyMoveResult[] {
    const { def } = assertInitialized(this._def, this._state);
    const results: ApplyMoveResult[] = [];
    const execOptions: ExecutionOptions = { trace: this._enableTrace };
    for (let i = 0; i < moves.length; i++) {
      const state = this._state!;
      this._history.push(state);
      try {
        const result = applyMove(def, state, moves[i]!, execOptions);
        this._state = result.state;
        results.push(result);
        onStep?.(result, i);
      } catch (err) {
        this._history.pop();
        throw toWorkerError('ILLEGAL_MOVE', err);
      }
    }
    return results;
  },

  terminalResult(): TerminalResult | null {
    const { def, state } = assertInitialized(this._def, this._state);
    return terminalResult(def, state);
  },

  getState(): GameState {
    const { state } = assertInitialized(this._def, this._state);
    return state;
  },

  getMetadata(): GameMetadata {
    const { def, state } = assertInitialized(this._def, this._state);
    return {
      gameId: def.metadata.id,
      playerCount: state.playerCount,
      phaseNames: def.turnStructure.phases.map((p) => p.id),
      actionNames: def.actions.map((a) => String(a.id)),
      zoneNames: def.zones.map((z) => String(z.id)),
    };
  },

  getHistoryLength(): number {
    return this._history.length;
  },

  undo(): GameState | null {
    if (this._history.length === 0) return null;
    this._state = this._history.pop()!;
    return this._state;
  },

  reset(def?: GameDef, seed?: number, options?: BridgeInitOptions): GameState {
    const resolvedDef = def ?? this._def;
    if (resolvedDef === null) {
      throw toWorkerError('NOT_INITIALIZED', 'No GameDef available. Provide one or call init() first.');
    }
    const resolvedSeed = seed ?? 0;
    return this.init(resolvedDef, resolvedSeed, options);
  },
};

export type GameWorkerAPI = typeof gameWorker;

expose(gameWorker);
```

### D2: Main-Thread Bridge

`packages/runner/src/bridge/game-bridge.ts`

Returns a `{ bridge, terminate }` tuple. The bridge is typed against `GameWorkerAPI`.

```typescript
import { wrap, proxy, type Remote } from 'comlink';
import type { GameWorkerAPI } from '../worker/game-worker';

export type GameBridge = Remote<GameWorkerAPI>;

export interface GameBridgeHandle {
  readonly bridge: GameBridge;
  readonly terminate: () => void;
}

export function createGameBridge(): GameBridgeHandle {
  const worker = new Worker(
    new URL('../worker/game-worker.ts', import.meta.url),
    { type: 'module' },
  );
  const bridge = wrap<GameWorkerAPI>(worker);
  return {
    bridge,
    terminate: () => worker.terminate(),
  };
}
```

**Comlink callback streaming**: When calling `playSequence()` with an `onStep` callback, the main thread wraps the callback with `Comlink.proxy()`:

```typescript
import { proxy } from 'comlink';

const results = await bridge.playSequence(
  moves,
  proxy((result, index) => {
    // This runs on the main thread for each move applied
    animationSystem.enqueueStep(result, index);
  }),
);
```

### D3: Structured Clone Verification

Unit tests that verify all kernel types crossing the worker boundary survive `structuredClone()`:

**State & definitions**:
- `GameState` round-trips through `structuredClone()` (including branded `PlayerId`, `ZoneId` — which are string/number aliases and clone fine)
- `GameDef` round-trips through `structuredClone()` (full definition with all nested objects)
- `Move` round-trips through `structuredClone()` (with branded `ActionId`)

**Execution results**:
- `ApplyMoveResult` round-trips — verify all four fields:
  - `state: GameState`
  - `triggerFirings: readonly TriggerLogEntry[]`
  - `warnings: readonly RuntimeWarning[]`
  - `effectTrace?: readonly EffectTraceEntry[]`
- `EffectTraceEntry[]` round-trips (all 8 variants: forEach, reduce, moveToken, setTokenProp, varChange, resourceTransfer, createToken, lifecycleEvent)
- `TriggerLogEntry[]` round-trips (all variants: fired, truncated, turnFlowLifecycle, turnFlowEligibility, simultaneousSubmission, simultaneousCommit, operationPartial, operationFree)
- `RuntimeWarning[]` round-trips

**Choice system**:
- `ChoiceRequest` round-trips — all three variants:
  - `ChoicePendingRequest` (kind: 'pending')
  - `ChoiceCompleteRequest` (kind: 'complete')
  - `ChoiceIllegalRequest` (kind: 'illegal')

**Terminal**:
- `TerminalResult` round-trips — all four variants: win, lossAll, draw, score

**Move enumeration**:
- `LegalMoveEnumerationResult` round-trips (moves + warnings)

**Bridge-specific**:
- `GameMetadata` round-trips
- `WorkerError` round-trips

If any type contains non-cloneable values (functions, symbols, class instances), document and resolve before proceeding.

### D4: Worker Initialization with GameDef Loading

The bridge must support loading a GameDef from:
1. A pre-compiled JSON object (passed directly)
2. A URL (fetched in the worker, parsed as JSON)

The worker validates the GameDef on load using the engine's validation function.

### D5: Error Propagation

Errors are serialized as `WorkerError` plain objects (structured-clone safe):

```typescript
interface WorkerError {
  readonly code: 'ILLEGAL_MOVE' | 'VALIDATION_FAILED' | 'NOT_INITIALIZED' | 'INTERNAL_ERROR';
  readonly message: string;
  readonly details?: unknown;
}
```

**Error code mapping**:

| Kernel error | Worker error code | UI treatment |
|---|---|---|
| `illegalMoveError` (any reason) | `ILLEGAL_MOVE` | Show reason in action toolbar tooltip/inline message |
| `assertValidatedGameDef` failure | `VALIDATION_FAILED` | Show error screen, block play |
| Worker method called before `init()` | `NOT_INITIALIZED` | Show "Load a game" prompt |
| Any other uncaught exception | `INTERNAL_ERROR` | Show recovery dialog (retry/reload) |

Worker crashes (uncaught exceptions) are caught by the main thread's `worker.onerror` handler.

### D6: Unit Tests

Test file: `packages/runner/test/worker/game-bridge.test.ts`

Tests (can use a small test GameDef fixture or compile Texas Hold'em):

**Initialization**:
- [ ] `init()` returns a valid GameState
- [ ] `init()` with explicit `playerCount` returns state with correct player count
- [ ] `init()` with `enableTrace: false` disables trace in subsequent `applyMove()` calls

**Move enumeration**:
- [ ] `legalMoves()` returns non-empty array for initial state
- [ ] `enumerateLegalMoves()` returns `{ moves, warnings }` with correct shape
- [ ] `enumerateLegalMoves()` with budget options respects limits

**Move application**:
- [ ] `applyMove()` returns `ApplyMoveResult` with all four fields (state, triggerFirings, warnings, effectTrace)
- [ ] `applyMove()` with `{ trace: true }` includes `effectTrace`
- [ ] `applyMove()` with `{ trace: false }` omits `effectTrace`
- [ ] Multiple sequential moves produce correct state progression

**Choice system**:
- [ ] `legalChoices()` returns correct `ChoiceRequest` variant for the game state

**Batch execution**:
- [ ] `playSequence()` returns correct number of `ApplyMoveResult` entries
- [ ] `playSequence()` with `onStep` callback fires for each move with correct index
- [ ] `playSequence()` stops and throws on illegal move (prior moves applied, state consistent)

**Terminal**:
- [ ] `terminalResult()` returns null for non-terminal state

**State management**:
- [ ] `getState()` returns current state snapshot
- [ ] `getMetadata()` returns correct game metadata (gameId, playerCount, phaseNames, actionNames, zoneNames)
- [ ] `getHistoryLength()` increments with each `applyMove()` and decrements with `undo()`

**Undo**:
- [ ] `undo()` restores previous state
- [ ] `undo()` on initial state returns null

**Reset**:
- [ ] `reset()` clears history and reinitializes with same def
- [ ] `reset()` with new seed produces different initial state
- [ ] `reset()` with new def loads the new game
- [ ] `reset()` with new `playerCount` changes player count

**Error handling**:
- [ ] Error propagation for illegal move includes `code: 'ILLEGAL_MOVE'`
- [ ] Methods called before `init()` throw `NOT_INITIALIZED` error
- [ ] `terminate()` cleanly shuts down worker (no further calls succeed)

---

## Implementation Notes

### Vite Worker Support

Vite handles Web Workers natively with `new Worker(new URL(...), { type: 'module' })`. No additional configuration needed. The worker file is bundled separately by Vite.

### BigInt Serialization

The kernel uses `bigint` for Zobrist hashes (`stateHash` on GameState) and internally for PRNG state. `structuredClone()` supports BigInt natively. Verify that Comlink does not interfere with BigInt serialization.

Note: The `seed` parameter to `initialState()` is `number` (not `bigint`). The kernel converts to BigInt internally via `BigInt(seed)`.

### State History in Worker

The undo stack lives in the worker, not the main thread. This keeps the worker as the single source of truth for game state. The main thread can request undo, and the worker returns the restored state. On `applyMove()` failure, the history push is rolled back to keep state consistent.

### Trace Configuration

The kernel's `ExecutionOptions.trace` controls whether `effectTrace` is populated on `ApplyMoveResult`. When `trace` is `false` or omitted, `effectTrace` is `undefined`.

The bridge defaults to `trace: true` because the animation system (Spec 40) depends on effect trace data. Without this default, the entire animation pipeline would have no data source.

Trace can be controlled at two levels:
1. **At init time**: `init(def, seed, { enableTrace: false })` — disables trace globally for this worker instance (useful for bulk AI evaluation workers).
2. **Per-call**: `applyMove(move, { trace: false })` — overrides the worker default for a single call.

### Comlink Callback Streaming

`playSequence()` accepts an optional `onStep` callback. On the main thread, this callback must be wrapped with `Comlink.proxy()` so Comlink can pass the function reference across the worker boundary:

```typescript
bridge.playSequence(moves, proxy((result, index) => { ... }));
```

The callback runs on the main thread for each move the worker applies. This enables progressive animation — the main thread can start animating move 0 while the worker computes move 1.

The callback receives `ApplyMoveResult` (structured-clone safe) and `moveIndex` (number). No special serialization required.

### Worker Factory Pattern

`createGameBridge()` returns a `{ bridge, terminate }` tuple. This cleanly separates the Comlink proxy lifecycle from the Worker lifecycle:

- `bridge` — the Comlink `Remote<GameWorkerAPI>` for RPC calls
- `terminate()` — calls `worker.terminate()` to destroy the worker

The main thread must call `terminate()` when navigating away from a game or when the component unmounts, to prevent worker leaks.

---

## Out of Scope

- AI agent integration (agents run on main thread or separate worker — decided in later specs)
- Multiplayer / networked play
- State persistence (handled by Spec 42 via Dexie.js)
- GameDef compilation (the runner consumes pre-compiled GameDef JSON)
- Transferable optimization (using `transfer()` for large state objects — potential future perf improvement, not needed at MVP scale)
