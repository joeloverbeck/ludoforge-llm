# PIXIFOUND-003: DefaultFactionColorProvider and ContainerPool

**Status**: ✅ COMPLETED
**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D11 (implementation utilities)
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-008, PIXIFOUND-010, PIXIFOUND-011

---

## Objective

Implement the `DefaultFactionColorProvider` (deterministic faction-to-color mapping) and the `ContainerPool` (reusable PixiJS Container instances for object pooling in zone/token renderers).

---

## Reassessed Assumptions (Validated Against Codebase)

1. `packages/runner/src/canvas/renderers/renderer-types.ts` already exists (from PIXIFOUND-002) and defines `FactionColorProvider#getColor(factionId: string | null, playerId: PlayerId): string`; this ticket must implement against that exact signature.
2. `packages/runner/src/canvas/renderers/` currently contains only `renderer-types.ts`; `faction-colors.ts` and `container-pool.ts` are still missing and are valid new-file targets.
3. Runner tests currently include only canvas contract tests (`renderer-types.test.ts`), so this ticket must add concrete behavioral tests for deterministic color mapping and pool lifecycle/reset invariants.
4. `pixi.js` v8 is already present in runner dependencies, so `ContainerPool` can directly use runtime `Container` behavior with no extra package changes.
5. Deterministic hash-to-palette mapping cannot guarantee globally unique colors for arbitrary faction IDs (finite palette); acceptance must validate determinism and bounded, valid palette output rather than universal uniqueness.

---

## Scope

- Implement `DefaultFactionColorProvider` in `packages/runner/src/canvas/renderers/faction-colors.ts`.
- Implement `ContainerPool` in `packages/runner/src/canvas/renderers/container-pool.ts`.
- Add focused unit tests for both modules under `packages/runner/test/canvas/renderers/`.

### Out of Scope

- Do NOT implement zone, token, or adjacency renderers — those are PIXIFOUND-008/009/010.
- Do NOT create `create-app.ts`, `layers.ts`, or any PixiJS application setup.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT implement `VisualConfigFactionColorProvider` — that is Spec 42.

---

## Architectural Rationale

This ticket remains beneficial versus the current architecture because it isolates two cross-renderer concerns as reusable primitives:

- `DefaultFactionColorProvider` centralizes deterministic, game-agnostic faction/player color selection so renderers do not embed duplicated color logic.
- `ContainerPool` encapsulates lifecycle reset/reuse behavior so upcoming renderers can remain diff-focused instead of owning cleanup internals.
- Keeping both utilities in the renderer foundation layer improves extensibility for Spec 42 overrides (custom color providers and richer visuals) without introducing game-specific branching.

This is cleaner than embedding color hashing/pool cleanup independently in each renderer.

---

## Files Touched

### New files
- `packages/runner/src/canvas/renderers/faction-colors.ts` — `DefaultFactionColorProvider` class
- `packages/runner/src/canvas/renderers/container-pool.ts` — `ContainerPool` utility

### New test files
- `packages/runner/test/canvas/renderers/faction-colors.test.ts`
- `packages/runner/test/canvas/renderers/container-pool.test.ts`

---

## Implementation Details

### DefaultFactionColorProvider

```typescript
export class DefaultFactionColorProvider implements FactionColorProvider {
  private readonly palette = [
    '#e63946', '#457b9d', '#2a9d8f', '#e9c46a',
    '#6a4c93', '#1982c4', '#ff595e', '#8ac926',
  ];

  getColor(factionId: string | null, playerId: PlayerId): string {
    // Deterministic: if factionId is non-null, hash it to palette index.
    // Otherwise fall back to a stable hash of playerId.
  }
}
```

### ContainerPool

Simple pool for reusable `Container` instances:
- `acquire(): Container` — returns a recycled or new Container.
- `release(container: Container): void` — resets and stores for reuse.
- `destroyAll(): void` — destroys all pooled containers.
- On release: remove all children, remove all listeners, reset position/scale/alpha.

---

## Acceptance Criteria

### Tests that must pass

**`faction-colors.test.ts`**:
- Same `(factionId, playerId)` always returns the same color (deterministic).
- Fallback path (`factionId === null`) is deterministic from `playerId`.
- Output always belongs to the provider palette and matches `#[0-9a-f]{6}`.
- Different representative faction IDs map to palette entries without runtime randomness.
- Palette wraps correctly for large `playerId` values.

**`container-pool.test.ts`**:
- `acquire()` returns a `Container` instance (mocked).
- `release()` then `acquire()` returns the same instance (reuse).
- Released containers have children removed and position reset.
- Released containers reset scale, alpha, rotation, visibility, interactivity/event mode, and parent linkage.
- `destroyAll()` calls `destroy()` on all pooled containers.
- Pool works correctly after multiple acquire/release cycles.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `DefaultFactionColorProvider` implements the `FactionColorProvider` interface from PIXIFOUND-002.
- Color assignment is fully deterministic (no randomness).
- ContainerPool does not leak references — `destroyAll()` cleans everything.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/renderers/faction-colors.ts` with `DefaultFactionColorProvider`, a deterministic FNV-1a string hash path for faction IDs, and player ID fallback mapping.
  - Added `packages/runner/src/canvas/renderers/container-pool.ts` with `acquire()`, `release()`, and `destroyAll()` plus explicit container reset semantics.
  - Added `packages/runner/test/canvas/renderers/faction-colors.test.ts` and `packages/runner/test/canvas/renderers/container-pool.test.ts` covering determinism, palette constraints, state reset, reuse, destroy lifecycle, and duplicate-release safety.
- **Deviation from original plan**:
  - Acceptance criteria were corrected to remove an unrealistic global uniqueness expectation for faction IDs with a finite palette.
  - `ContainerPool` additionally guards against duplicate release to prevent accidental double-pooling.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (14 files, 117 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
