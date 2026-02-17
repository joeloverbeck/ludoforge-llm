# STATEMOD-001: Add Zustand Dependency & Define Store Support Types

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: XS
**Spec**: 37 — State Management & Render Model
**Deps**: Spec 36 (completed)

## Objective

Add the `zustand` package (with `subscribeWithSelector` middleware) to the runner package and create the supporting type definitions used by the store and render model.

## Reassessed Assumptions (2026-02-17)

- `packages/runner/tsconfig.json` currently includes only `src/**/*`; files under `packages/runner/test/**/*` are **not** checked by `pnpm -F @ludoforge/runner typecheck`.
- Therefore, type-safety expectations for this ticket must be validated by:
  1. compile-time checks on `src` (`pnpm -F @ludoforge/runner typecheck`), and
  2. runner tests via Vitest (`pnpm -F @ludoforge/runner test`) for constructability/import smoke coverage.
- No `store/` module exists yet in `packages/runner/src`, so this ticket remains the correct first step for Spec 37 state modules.

## Files to Touch

- `packages/runner/package.json` — add `zustand` dependency
- `packages/runner/src/store/store-types.ts` — **new file**: `PartialChoice`, `RenderContext` interfaces
- `packages/runner/test/store/store-types.test.ts` — **new file**: type-level smoke tests

## Out of Scope

- The Zustand store implementation itself (STATEMOD-008)
- `RenderModel` type definitions (STATEMOD-003)
- `deriveRenderModel()` implementation (STATEMOD-004 through STATEMOD-007)
- Any React hooks or PixiJS integration
- Any engine changes

## What to Do

### 1. Add zustand dependency

```bash
pnpm -F @ludoforge/runner add zustand
```

Zustand v5 is current. Verify `subscribeWithSelector` is available from `zustand/middleware`.

### 2. Create `store-types.ts`

```typescript
// packages/runner/src/store/store-types.ts
import type {
  PlayerId,
  ActionId,
  MoveParamValue,
  ChoicePendingRequest,
  LegalMoveEnumerationResult,
  TerminalResult,
} from '@ludoforge/engine';

/** One step in the progressive choice breadcrumb. */
export interface PartialChoice {
  readonly decisionId: string;
  readonly name: string;
  readonly value: MoveParamValue;
}

/** Context passed to deriveRenderModel() beyond state + def. */
export interface RenderContext {
  readonly playerID: PlayerId;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, 'human' | 'ai-random' | 'ai-greedy'>;
  readonly terminal: TerminalResult | null;
}
```

### 3. Type-level smoke test

Verify that imports resolve, interfaces are constructable in test fixtures, and branded engine types pass through correctly.

## Acceptance Criteria

### Tests that must pass

- [x] `packages/runner/test/store/store-types.test.ts`: imports resolve and `PartialChoice` can be constructed with valid `MoveParamValue`
- [x] `packages/runner/test/store/store-types.test.ts`: `RenderContext` can be constructed with required fields using engine branded types
- [x] `pnpm -F @ludoforge/runner test -- store/store-types.test.ts` passes
- [x] `pnpm -F @ludoforge/runner typecheck` passes

### Invariants

- `zustand` appears in `dependencies` (not `devDependencies`) of `packages/runner/package.json`
- All type fields are `readonly`
- `PlayerId` is `Brand<number, 'PlayerId'>` (numeric), not string
- No runtime code in `store-types.ts` — types/interfaces only
- No engine source files modified

## Outcome

- **Completed**: 2026-02-17
- **What changed**:
  - Added `zustand` to `packages/runner` runtime dependencies.
  - Added `packages/runner/src/store/store-types.ts` with `PartialChoice`, `RenderContext`, and shared `PlayerSeat` role type.
  - Added `packages/runner/test/store/store-types.test.ts` to verify imports and constructability with branded engine types.
  - Corrected ticket assumptions to reflect the current runner toolchain (`typecheck` includes `src/**/*`, while tests validate constructability in `test/**/*`).
- **Deviation from original plan**:
  - Kept test file under `packages/runner/test/store/` as planned, but explicitly documented that this is not part of `tsc --noEmit` scope in the current runner config.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- store/store-types.test.ts` (Vitest run completed; all runner tests passed in this repository state)
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
