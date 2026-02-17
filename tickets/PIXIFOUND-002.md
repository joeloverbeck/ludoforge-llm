# PIXIFOUND-002: Renderer Interfaces and Position Type

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D11 (type definitions only)
**Priority**: P0
**Depends on**: PIXIFOUND-001
**Blocks**: PIXIFOUND-003 through PIXIFOUND-015

---

## Objective

Define the central type definitions and renderer interfaces that all canvas renderers implement. This is the contract layer — no implementations, no PixiJS runtime logic.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/renderer-types.ts` — `Position`, `ZoneRenderer`, `TokenRenderer`, `AdjacencyRenderer`, `FactionColorProvider` interfaces

### New test files
- `packages/runner/test/canvas/renderers/renderer-types.test.ts` — type-level compile checks (import and assert structure)

---

## Out of Scope

- Do NOT implement any renderer (zone, token, adjacency) — those are PIXIFOUND-008/009/010.
- Do NOT implement `DefaultFactionColorProvider` or `ContainerPool` — those are PIXIFOUND-003.
- Do NOT create `create-app.ts`, `layers.ts`, or any PixiJS runtime code.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).

---

## Implementation Details

Define in `renderer-types.ts`:

```typescript
export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface ZoneRenderer {
  update(
    zones: readonly RenderZone[],
    mapSpaces: readonly RenderMapSpace[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TokenRenderer {
  update(
    tokens: readonly RenderToken[],
    zoneContainers: ReadonlyMap<string, Container>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface AdjacencyRenderer {
  update(
    adjacencies: readonly RenderAdjacency[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  destroy(): void;
}

export interface FactionColorProvider {
  getColor(factionId: string | null, playerIndex: number): string;
}
```

Import `RenderZone`, `RenderMapSpace`, `RenderToken`, `RenderAdjacency` from `../../model/render-model.js`. Import `Container` from `pixi.js`.

---

## Acceptance Criteria

### Tests that must pass
- `packages/runner/test/canvas/renderers/renderer-types.test.ts`:
  - Importing all interfaces compiles without error.
  - A mock object satisfying `ZoneRenderer` type-checks correctly.
  - A mock object satisfying `TokenRenderer` type-checks correctly.
  - A mock object satisfying `AdjacencyRenderer` type-checks correctly.
  - A mock object satisfying `FactionColorProvider` type-checks correctly.
  - `Position` is a readonly `{x, y}` pair of numbers.
- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- No modifications to existing source files in `store/`, `model/`, `worker/`, `bridge/`.
- Interfaces use `readonly` arrays and maps consistently (matching RenderModel conventions).
- `Container` import comes from `pixi.js` (not a custom wrapper).
