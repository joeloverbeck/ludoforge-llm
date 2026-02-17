# STATEMOD-008: Implement `createGameStore()` Zustand Factory

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D1, D5, D6)
**Deps**: STATEMOD-001, STATEMOD-003, STATEMOD-004 through STATEMOD-007

## Objective

Implement the Zustand store factory `createGameStore(bridge)` that bridges the Web Worker kernel to the rendering layer. The store manages game lifecycle, delegates calls to the bridge, tracks error/loading states, maintains move construction state, and re-derives the `RenderModel` after every state change.

## Assumption Reassessment (2026-02-17)

- `packages/runner/src/store/store-types.ts` already exists and is the canonical home for `PartialChoice`, `PlayerSeat`, and `RenderContext`. `game-store.ts` must reuse these shared types instead of redefining equivalents.
- `deriveRenderModel()` and its state/visibility behavior are already implemented and covered by dedicated model tests in `packages/runner/test/model/`. This ticket should focus on store orchestration, not re-testing render-model internals.
- `GameWorkerAPI` (`createGameWorker()`) is synchronous for `init`, `enumerateLegalMoves`, `legalChoices`, `applyMove`, `terminalResult`, and `undo`; store actions remain synchronous and must not introduce async wrappers.
- The engine materializes per-player zones in runtime state (e.g., `hand:0`, `hand:1`). Store logic should treat zone identity as opaque and never perform zone expansion itself.
- Choice decision IDs can be internal/composed; when building move params, use the active `ChoicePendingRequest.name` as the binding key.

## Scope Update

- Keep `STATEMOD-008` as the store factory + store action unit coverage ticket.
- Keep deep `deriveRenderModel()` behavioral coverage in existing model tests and `STATEMOD-009` integration tests.
- Prefer a single internal refresh/re-derive pathway (query legal moves + terminal + derive model) reused by `initGame`, `confirmMove`, and `undo` to avoid divergence across lifecycle transitions.

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

After every state-changing **or move-context-changing** action, call `deriveRenderModel(state, def, context)` and set `renderModel`. The `RenderContext` is assembled from current store state.

### 5. Error handling (D6)

- Wrap all bridge calls in try/catch.
- On error: set `error` to the caught `WorkerError`, set `loading: false`.
- `WorkerError` has `code`, `message`, optional `details`.

## Acceptance Criteria

### Tests that must pass

Note: Tests should use in-memory bridge semantics (`createGameWorker()` API shape, no real Web Worker thread). A test double around that API is acceptable for deterministic edge-case coverage.

- [x] `initGame()` populates `gameState`, `gameDef`, `playerID`, `legalMoveResult`, `renderModel`, and sets `gameLifecycle = 'playing'`
- [x] `initGame()` with terminal game sets `gameLifecycle = 'terminal'`
- [x] `selectAction()` sets `selectedAction` and resets choice state
- [x] `makeChoice()` pushes to `choiceStack` and queries `legalChoices`
- [x] `makeChoice()` with complete choice sets `choicePending = null`
- [x] `makeChoice()` with illegal choice sets `error` and does not corrupt existing move construction state
- [x] `confirmMove()` applies move, updates state, refreshes legal moves and terminal, re-derives render model
- [x] `confirmMove()` resets move construction state
- [x] `confirmMove()` is a no-op when `partialMove` is `null`
- [x] `cancelChoice()` pops from `choiceStack`
- [x] `cancelChoice()` on empty stack is a no-op
- [x] `cancelMove()` resets all move construction state
- [x] `undo()` with history restores previous state, re-enumerates legal moves, re-checks terminal
- [x] `undo()` with no history does nothing
- [x] `undo()` from terminal state transitions lifecycle back to `'playing'`
- [x] Error handling: bridge error sets `error` field with correct `WorkerError` shape
- [x] `clearError()` resets error to `null`
- [x] `loading` is `true` during bridge calls, `false` after
- [x] Lifecycle transitions: `idle → initializing → playing → terminal`
- [x] `setAnimationPlaying()` toggles flag
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes

### Invariants

- [x] Store is created via factory — no global singleton
- [x] `subscribeWithSelector` middleware is applied for fine-grained PixiJS subscriptions
- [x] `renderModel` is always re-derived after state changes (never stale)
- [x] All bridge calls are wrapped in error handling
- [x] `PlayerId` is branded number throughout
- [x] `loading` correctly brackets all bridge calls (set before, cleared after, even on error)
- [x] No game-specific logic in the store
- [x] No engine source files modified

## Outcome

- Completion date: 2026-02-17
- Implemented `packages/runner/src/store/game-store.ts` with `createGameStore(bridge)`, full lifecycle/move-construction actions, shared refresh + render-model re-derivation flow, and normalized WorkerError handling.
- Added `packages/runner/test/store/game-store.test.ts` covering lifecycle, choice progression, illegal choice/error handling, confirm/cancel/undo behavior, loading bracketing, and animation/error utility actions.
- Deviations from original plan:
  - Reused existing `packages/runner/src/store/store-types.ts` instead of redefining `PartialChoice`/`RenderContext`.
  - Used deterministic in-memory bridge stubs for choice-flow edge cases while keeping real `createGameWorker()` coverage for lifecycle/apply/undo behavior.
  - `selectAction()` now performs an immediate `legalChoices()` query to initialize progressive-choice state, preventing stale/empty choice UI state.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
