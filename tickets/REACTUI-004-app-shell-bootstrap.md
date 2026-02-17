# REACTUI-004: App Shell Bootstrap

**Spec**: 39 (React DOM UI Layer) — Deliverable D3
**Priority**: P0 (makes the app actually run)
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Revise `App.tsx` to create the game bridge, Zustand store, and trigger game initialization on mount. Wire `ErrorBoundary` around `GameContainer`. Replace the current placeholder JSX.

---

## File List

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/App.tsx` | Replace placeholder with bridge/store creation + `<ErrorBoundary><GameContainer /></ErrorBoundary>` |

---

## Detailed Requirements

### App.tsx revision

1. **On module load** (outside component, or via `useRef` + lazy init):
   - Call `createGameBridge()` to get a `GameBridgeHandle`.
   - Call `createGameStore(bridge)` to get the Zustand store.
2. **On mount** (`useEffect` with empty deps):
   - Load a `GameDef` (hardcoded bundled fixture or `import` from test data for now — game selection UI is Spec 42).
   - Call `store.getState().initGame(gameDef, seed, playerID)`.
   - `seed`: any deterministic default (e.g., `42`).
   - `playerID`: first player ID from `gameDef.players[0].id`.
3. **Render**:
   ```tsx
   <ErrorBoundary>
     <GameContainer store={store} />
   </ErrorBoundary>
   ```
4. **Cleanup** (`useEffect` return): call `bridgeHandle.terminate()` to clean up the web worker.

### GameDef source (temporary)

For now, import or inline a minimal fixture GameDef that exercises the UI. This can be the same kind of fixture used in `game-store.test.ts`. Spec 42 will replace this with a game selection screen.

---

## Out of Scope

- Game selection UI (Spec 42)
- Pre-game player/seat configuration (Spec 42)
- Multiple game support or game list
- Save/load (Spec 42)
- Loading GameDef from network URL
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/App.test.tsx` | App renders without crashing |
| `packages/runner/test/ui/App.test.tsx` | ErrorBoundary wraps GameContainer |
| `packages/runner/test/ui/App.test.tsx` | `createGameBridge` is called on mount |
| `packages/runner/test/ui/App.test.tsx` | `createGameStore` is called with the bridge |
| `packages/runner/test/ui/App.test.tsx` | `initGame` is called on mount |
| `packages/runner/test/ui/App.test.tsx` | Worker is terminated on unmount |

### Invariants

- The old placeholder content in `App.tsx` is **fully removed**.
- Bridge and store are created **once** (not on every render). Use `useRef` or module-level initialization.
- `initGame` is called exactly once on mount.
- Worker cleanup runs on unmount.
- No game-specific logic in `App.tsx` beyond the temporary fixture loading.
- `ErrorBoundary` is the outermost wrapper inside `App`.
