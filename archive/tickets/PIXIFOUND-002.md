# PIXIFOUND-002: Renderer Interfaces and Position Type

**Status**: ✅ COMPLETED
**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D11 (type definitions only)
**Priority**: P0
**Depends on**: PIXIFOUND-001
**Blocks**: PIXIFOUND-003 through PIXIFOUND-015

---

## Objective

Define the central type definitions and renderer interfaces that all canvas renderers implement. This is the contract layer — no implementations, no PixiJS runtime logic.

---

## Reassessed Assumptions (Validated Against Codebase)

1. `packages/runner/src/canvas/` does not exist yet, so this ticket must create the initial canvas renderer contract files and folders.
2. Render-model contracts required by D11 already exist in `packages/runner/src/model/render-model.ts` with readonly-first typing, so renderer interfaces should mirror that immutability style.
3. Runner TypeScript modules currently use extensionless local imports (for example `../../src/model/render-model` in tests), so this ticket should use extensionless imports for consistency.
4. This ticket is type-contract-only. Any PixiJS symbols must be imported as types to avoid introducing runtime behavior at this stage.
5. Current runner tests are model/store/worker focused; no canvas tests exist yet, so adding targeted contract tests under `packages/runner/test/canvas/` is required and non-overlapping.

---

## Scope

- Create canvas renderer contract types in `renderer-types.ts` exactly for D11 (`Position`, `ZoneRenderer`, `TokenRenderer`, `AdjacencyRenderer`, `FactionColorProvider`).
- Add type-focused runner tests that lock these contracts and immutability assumptions.
- Keep changes isolated to new canvas files and tests only.

### Out of Scope

- No renderer implementations (PIXIFOUND-008/009/010).
- No `DefaultFactionColorProvider`/`ContainerPool` implementations (PIXIFOUND-003).
- No app/layer/viewport/interaction/runtime wiring files.
- No `packages/engine/` changes.
- No modifications to existing runner files in `store/`, `model/`, `worker/`, `bridge/`.

---

## Architectural Rationale

This ticket is beneficial to the current architecture because it establishes a strict, generic contract boundary before any rendering logic exists:

- Renderers depend on `RenderModel`-derived data contracts, preserving game-agnostic behavior from Spec 38.
- `getContainerMap()` on zone/token renderers creates a stable integration seam for upcoming animation and interaction systems without coupling those systems now.
- Type-only PixiJS imports keep this layer purely declarative and avoid accidental runtime side effects.

This is cleaner and more extensible than introducing early concrete renderer code or game-specific shortcuts in the foundation layer.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/renderer-types.ts` — `Position`, `ZoneRenderer`, `TokenRenderer`, `AdjacencyRenderer`, `FactionColorProvider` interfaces

### New test files
- `packages/runner/test/canvas/renderers/renderer-types.test.ts` — type-level compile checks (import and assert structure)

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

Import `RenderZone`, `RenderMapSpace`, `RenderToken`, `RenderAdjacency` from `../../model/render-model` (extensionless, matching runner conventions). Import `Container` from `pixi.js` as a type import.

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

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/renderers/renderer-types.ts` with D11 interfaces: `Position`, `ZoneRenderer`, `TokenRenderer`, `AdjacencyRenderer`, `FactionColorProvider`.
  - Added `packages/runner/test/canvas/renderers/renderer-types.test.ts` with contract-level type checks for all interfaces and `Position` readonly shape.
  - Updated ticket assumptions before implementation to match current codebase conventions (extensionless local imports, type-only Pixi import intent, and empty canvas directory baseline).
- **Deviation from original plan**:
  - Clarified import contract to use extensionless local path (`../../model/render-model`) and a type import for `Container` to keep this ticket runtime-free.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (12 files, 107 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
