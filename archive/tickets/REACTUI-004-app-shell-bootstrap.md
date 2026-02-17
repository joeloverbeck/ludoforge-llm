# REACTUI-004: App Shell Bootstrap

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverable D3
**Priority**: P0 (makes the app actually run)
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Revise `App.tsx` to create the game bridge, Zustand store, and trigger game initialization on mount. Wire `ErrorBoundary` around `GameContainer`. Replace the current placeholder JSX.

---

## Reassessed Assumptions and Scope Corrections

1. **`GameDef` player identity assumption is incorrect in current codebase**
   - Prior assumption: bootstrap can read `gameDef.players[0].id`.
   - Actual code contract: `GameDef` does not expose a `players[]` list with IDs; the runner uses numeric `PlayerId` (e.g., `asPlayerId(0)` in store tests).
   - Correction: bootstrap with deterministic default `playerID = asPlayerId(0)` until Spec 42 introduces session/player configuration.

2. **App bootstrap test file does not exist yet**
   - Prior assumption: `packages/runner/test/ui/App.test.tsx` already exists.
   - Actual repository state: no App UI test file currently exists.
   - Correction: create `packages/runner/test/ui/App.test.ts` and define bootstrap behavior tests there.

3. **Bridge/store creation timing wording was internally inconsistent**
   - Prior requirements said both:
     - "On module load (outside component, or via `useRef` + lazy init)"
     - "`createGameBridge` is called on mount"
   - Correction: define invariant as **created once per App component mount using lazy refs** (not recreated on every render). Test should verify single creation per mount.

4. **Fixture loading should avoid runtime compiler coupling**
   - Prior assumption allowed importing test data fixture.
   - Architectural correction: keep runtime bootstrap independent of CNL compiler/test-only helpers. Use a bundled static GameDef fixture under runner source, not test fixtures.

5. **Bridge/store contract mismatch required explicit scope expansion**
   - Prior assumption: `createGameStore(bridge)` can consume `createGameBridge().bridge` directly.
   - Actual code contract before this ticket: store expected synchronous worker API calls, while Comlink `Remote` bridge is async.
   - Correction: this ticket now includes refactoring runner bridge/store integration to async-first APIs so App bootstrap can use the true worker bridge architecture directly.

---

## File List

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/App.tsx` | Replace placeholder with bridge/store creation + `<ErrorBoundary><GameContainer /></ErrorBoundary>` |
| `packages/runner/src/bootstrap/default-game-def.json` | Add bundled temporary bootstrap GameDef fixture |
| `packages/runner/test/ui/App.test.ts` | Add App bootstrap tests (bridge/store/init/cleanup wiring) |
| `packages/runner/src/worker/game-worker-api.ts` | Refactor worker API surface to async-first methods |
| `packages/runner/src/store/game-store.ts` | Refactor bridge/store flow to await async worker methods |
| `packages/runner/test/store/game-store.test.ts` | Update store tests for async action flow; strengthen async-state invariants |
| `packages/runner/test/worker/game-worker.test.ts` | Update worker tests for async API contracts |

---

## Detailed Requirements

### App.tsx revision

1. **On first render of an App mount** (via `useRef` lazy init):
   - Call `createGameBridge()` once to get a `GameBridgeHandle`.
   - Call `createGameStore(bridge)` once with `bridgeHandle.bridge` to get the Zustand store.
   - Do not recreate bridge/store on re-render.
2. **On mount** (`useEffect` with empty deps):
   - Load a bundled temporary `GameDef` fixture from runner source.
   - Call `store.getState().initGame(gameDef, seed, playerID)`.
   - `seed`: any deterministic default (e.g., `42`).
   - `playerID`: deterministic default `asPlayerId(0)` until Spec 42 adds configuration.
3. **Render**:
   ```tsx
   <ErrorBoundary>
     <GameContainer store={store} />
   </ErrorBoundary>
   ```
4. **Cleanup** (`useEffect` return): call `bridgeHandle.terminate()` to clean up the web worker.

### GameDef source (temporary)

For now, import a bundled minimal fixture GameDef under runner source that exercises the UI shell. Spec 42 will replace this with a game selection screen.

### Async bridge/store alignment (expanded scope)

- Store bridge interactions (`initGame`, action selection/choices, move submit, undo) must await async worker calls.
- Runner worker API should expose async-returning methods so both local test worker and Comlink remote bridge share one contract.
- Loading/error lifecycle semantics remain deterministic:
  - loading set true before async bridge operation
  - loading set false in `finally`
  - `WorkerError` mapping preserved on failure

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
| `packages/runner/test/ui/App.test.ts` | App renders without crashing |
| `packages/runner/test/ui/App.test.ts` | `ErrorBoundary` wraps `GameContainer` |
| `packages/runner/test/ui/App.test.ts` | Bridge/store are created once per App mount |
| `packages/runner/test/ui/App.test.ts` | `initGame` is called on mount with deterministic seed/player |
| `packages/runner/test/ui/App.test.ts` | Worker is terminated on unmount cleanup |
| `packages/runner/test/store/game-store.test.ts` | Store actions correctly await async bridge responses and preserve lifecycle/error invariants |
| `packages/runner/test/worker/game-worker.test.ts` | Worker API methods expose async contract without behavioral regression |

### Invariants

- The old placeholder content in `App.tsx` is **fully removed**.
- Bridge and store are created **once per App mount** (not on every render). Use `useRef` lazy initialization.
- `initGame` is called exactly once on mount.
- Worker cleanup runs on unmount.
- No game-specific logic in `App.tsx` beyond temporary fixture loading.
- `ErrorBoundary` is the outermost wrapper inside `App`.
- No sync bridge shims, alias paths, or compatibility adapters are introduced; runner bridge/store integration is natively async.

---

## Outcome

- **Completion date**: 2026-02-17
- **What was actually changed**:
  - Replaced placeholder `App.tsx` with real bootstrap: lazy bridge/store creation, mount-time `initGame`, unmount-time worker termination, and `ErrorBoundary` + `GameContainer` shell composition.
  - Added bundled bootstrap fixture `packages/runner/src/bootstrap/default-game-def.json`.
  - Added new App bootstrap tests in `packages/runner/test/ui/App.test.ts`.
  - Refactored runner worker/store architecture to async-first bridge contract:
    - `packages/runner/src/worker/game-worker-api.ts`
    - `packages/runner/src/store/game-store.ts`
    - async-aware updates to `packages/runner/test/store/game-store.test.ts`, `packages/runner/test/worker/game-worker.test.ts`, and `packages/runner/test/worker/clone-compat.test.ts`.
  - Added browser-safe engine runtime surface:
    - `packages/engine/src/kernel/runtime.ts`
    - `packages/engine/package.json` export `./runtime`
    - migrated runner engine imports to `@ludoforge/engine/runtime` for browser/worker safety.
- **Deviations from original plan**:
  - Scope expanded beyond App bootstrap to resolve an architectural mismatch (sync store vs async Comlink bridge) and a build blocker (Node-only engine exports in browser worker graph).
- **Verification results**:
  - `pnpm turbo build` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
