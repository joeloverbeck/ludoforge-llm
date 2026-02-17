# PIXIFOUND-003: DefaultFactionColorProvider and ContainerPool

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D11 (implementation utilities)
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-008, PIXIFOUND-010, PIXIFOUND-011

---

## Objective

Implement the `DefaultFactionColorProvider` (deterministic faction-to-color mapping) and the `ContainerPool` (reusable PixiJS Container instances for object pooling in zone/token renderers).

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/faction-colors.ts` — `DefaultFactionColorProvider` class
- `packages/runner/src/canvas/renderers/container-pool.ts` — `ContainerPool` utility

### New test files
- `packages/runner/test/canvas/renderers/faction-colors.test.ts`
- `packages/runner/test/canvas/renderers/container-pool.test.ts`

---

## Out of Scope

- Do NOT implement zone, token, or adjacency renderers — those are PIXIFOUND-008/009/010.
- Do NOT create `create-app.ts`, `layers.ts`, or any PixiJS application setup.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT implement `VisualConfigFactionColorProvider` — that is Spec 42.

---

## Implementation Details

### DefaultFactionColorProvider

```typescript
export class DefaultFactionColorProvider implements FactionColorProvider {
  private readonly palette = [
    '#e63946', '#457b9d', '#2a9d8f', '#e9c46a',
    '#6a4c93', '#1982c4', '#ff595e', '#8ac926',
  ];

  getColor(factionId: string | null, playerIndex: number): string {
    // Deterministic: if factionId is non-null, hash it to palette index.
    // Otherwise fall back to playerIndex mod palette length.
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
- Same `(factionId, playerIndex)` always returns the same color (deterministic).
- Different faction IDs return different colors (up to palette size).
- `null` factionId falls back to playerIndex-based color.
- Palette wraps correctly when playerIndex exceeds palette length.
- Colors are valid hex strings matching `#[0-9a-f]{6}`.

**`container-pool.test.ts`**:
- `acquire()` returns a `Container` instance (mocked).
- `release()` then `acquire()` returns the same instance (reuse).
- Released containers have children removed and position reset.
- `destroyAll()` calls `destroy()` on all pooled containers.
- Pool works correctly after multiple acquire/release cycles.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `DefaultFactionColorProvider` implements the `FactionColorProvider` interface from PIXIFOUND-002.
- Color assignment is fully deterministic (no randomness).
- ContainerPool does not leak references — `destroyAll()` cleans everything.
