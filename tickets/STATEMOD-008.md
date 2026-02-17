# STATEMOD-008: Implement `createGameStore()` Zustand Factory

**Status**: PENDING
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D1, D5, D6)
**Deps**: STATEMOD-001, STATEMOD-003, STATEMOD-004 through STATEMOD-007

## Objective

Implement the Zustand store factory `createGameStore(bridge)` that bridges the Web Worker kernel to the rendering layer. The store manages game lifecycle, delegates calls to the bridge, tracks error/loading states, maintains move construction state, and re-derives the `RenderModel` after every state change.

## Files to Touch

- `packages/runner/src/store/game-store.ts` — **new file**: `createGameStore()` factory, `GameStore` interface
- `packages/runner/test/store/game-store.test.ts` — **new file**: unit tests for store actions

## Out of Scope

- `RenderModel` types (STATEMOD-003, already done)
- `deriveRenderModel()` implementation (STATEMOD-004 through STATEMOD-007, already done)
- `formatIdAsDisplayName()` utility (STATEMOD-002, already done)
- PixiJS canvas integration (Spec 38)
- React DOM components (Spec 39)
- Animation processing (Spec 40)
- AI agent move selection (game loop coordinator concern)
- Any engine changes

## What to Do

### 1. Define `GameStore` interface

As specified in the spec D1:

```typescript
interface GameStore {
  // Core state
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;

  // Lifecycle
  readonly gameLifecycle: 'idle' | 'initializing' | 'playing' | 'terminal';
  readonly loading: boolean;
  readonly error: WorkerError | null;

  // Kernel query results
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly terminal: TerminalResult | null;

  // Move construction state
  readonly selectedAction: ActionId | null;
  readonly partialMove: Move | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly animationPlaying: boolean;

  // Player configuration
  readonly playerSeats: ReadonlyMap<PlayerId, 'human' | 'ai-random' | 'ai-greedy'>;

  // Derived
  readonly renderModel: RenderModel | null;

  // Actions
  initGame(def: GameDef, seed: number, playerID: PlayerId): void;
  selectAction(actionId: ActionId): void;
  makeChoice(choice: MoveParamValue): void;
  confirmMove(): void;
  cancelChoice(): void;
  cancelMove(): void;
  undo(): void;
  setAnimationPlaying(playing: boolean): void;
  clearError(): void;
}
```

### 2. Implement `createGameStore(bridge)`

```typescript
export function createGameStore(bridge: GameWorkerAPI) {
  return create<GameStore>()(
    subscribeWithSelector((set, get) => ({
      // initial state + action implementations
    }))
  );
}
```

### 3. Action implementations

**`initGame(def, seed, playerID)`** (D1 initGame flow):
1. Set `gameLifecycle: 'initializing'`, `loading: true`.
2. Call `bridge.init(def, seed)` → set `gameState`, `gameDef`, `playerID`.
3. Call `bridge.enumerateLegalMoves()` → set `legalMoveResult`.
4. Call `bridge.terminalResult()` → set `terminal`.
5. Set `gameLifecycle` to `'playing'` (or `'terminal'` if terminal is non-null).
6. Derive and set `renderModel`.
7. Set `loading: false`.
8. On error: set `error`, `loading: false`.

**`selectAction(actionId)`**:
- Set `selectedAction`, reset `partialMove`, `choiceStack`, `choicePending`.

**`makeChoice(choice)`**:
- Push choice to `choiceStack`.
- Update `partialMove` with the new param.
- Call `bridge.legalChoices(partialMove)` to get the next `ChoiceRequest`.
- If `kind === 'complete'`, set `choicePending` to `null` (move is ready to confirm).
- If `kind === 'pending'`, set `choicePending` to the request.
- If `kind === 'illegal'`, set error.

**`confirmMove()`**:
- Set `loading: true`.
- Call `bridge.applyMove(partialMove)`.
- Update `gameState`, `effectTrace`, `triggerFirings` from result.
- Call `bridge.enumerateLegalMoves()`, `bridge.terminalResult()`.
- Update `terminal`, `legalMoveResult`.
- Reset move construction state (`selectedAction`, `partialMove`, `choiceStack`, `choicePending`).
- Re-derive `renderModel`.
- Set `loading: false`, update `gameLifecycle` if terminal.

**`cancelChoice()`**:
- Pop last entry from `choiceStack`.
- Rebuild `partialMove` from remaining stack.
- Re-query `bridge.legalChoices()` if stack is non-empty, else reset `choicePending`.

**`cancelMove()`**:
- Reset `selectedAction`, `partialMove`, `choiceStack`, `choicePending`.

**`undo()`** (D5):
- Call `bridge.undo()`. If returns `null`, do nothing.
- After success: call `bridge.enumerateLegalMoves()` and `bridge.terminalResult()`.
- Update `gameState`, `legalMoveResult`, `terminal`.
- Reset move construction state.
- Re-derive `renderModel`.
- Update `gameLifecycle` (may transition from `'terminal'` back to `'playing'`).

**`setAnimationPlaying(playing)`**:
- Set `animationPlaying`.

**`clearError()`** (D6):
- Set `error: null`.

### 4. Render model re-derivation

After every state-changing action, call `deriveRenderModel(state, def, context)` and set `renderModel`. The `RenderContext` is assembled from current store state.

### 5. Error handling (D6)

- Wrap all bridge calls in try/catch.
- On error: set `error` to the caught `WorkerError`, set `loading: false`.
- `WorkerError` has `code`, `message`, optional `details`.

## Acceptance Criteria

### Tests that must pass

Note: Tests should use a mock/stub bridge (the actual `createGameWorker()` in-memory, NOT a real Web Worker) to test store actions synchronously.

- [ ] `initGame()` populates `gameState`, `gameDef`, `playerID`, `legalMoveResult`, `renderModel`, and sets `gameLifecycle = 'playing'`
- [ ] `initGame()` with terminal game sets `gameLifecycle = 'terminal'`
- [ ] `selectAction()` sets `selectedAction` and resets choice state
- [ ] `makeChoice()` pushes to `choiceStack` and queries `legalChoices`
- [ ] `makeChoice()` with complete choice sets `choicePending = null`
- [ ] `confirmMove()` applies move, updates state, refreshes legal moves and terminal, re-derives render model
- [ ] `confirmMove()` resets move construction state
- [ ] `cancelChoice()` pops from `choiceStack`
- [ ] `cancelMove()` resets all move construction state
- [ ] `undo()` with history restores previous state, re-enumerates legal moves, re-checks terminal
- [ ] `undo()` with no history does nothing
- [ ] `undo()` from terminal state transitions lifecycle back to `'playing'`
- [ ] Error handling: bridge error sets `error` field with correct `WorkerError` shape
- [ ] `clearError()` resets error to `null`
- [ ] `loading` is `true` during bridge calls, `false` after
- [ ] Lifecycle transitions: `idle → initializing → playing → terminal`
- [ ] `setAnimationPlaying()` toggles flag
- [ ] `pnpm -F @ludoforge/runner typecheck` passes
- [ ] `pnpm -F @ludoforge/runner test` passes

### Invariants

- Store is created via factory — no global singleton
- `subscribeWithSelector` middleware is applied for fine-grained PixiJS subscriptions
- `renderModel` is always re-derived after state changes (never stale)
- All bridge calls are wrapped in error handling
- `PlayerId` is branded number throughout
- `loading` correctly brackets all bridge calls (set before, cleared after, even on error)
- No game-specific logic in the store
- No engine source files modified
