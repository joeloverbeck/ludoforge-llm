# STATEMOD-003: Define RenderModel Type Definitions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D2)
**Deps**: None

## Objective

Define all `Render*` TypeScript interfaces that make up the `RenderModel` — the flat, denormalized, game-agnostic view of game state consumed by both the PixiJS canvas and React DOM UI.

This establishes a single canonical view contract for the runner, so rendering and state derivation can evolve independently while staying strongly typed.

## Assumptions Reassessed

- `STATEMOD-001` and `STATEMOD-002` are not present in the active `tickets/` backlog; this ticket is not blocked by them.
- `packages/runner/src/store/store-types.ts` already exists and defines `RenderContext`/`PartialChoice`; this ticket must remain compatible with those types and should not redefine them.
- Runner tests use Vitest (`pnpm -F @ludoforge/runner test`), so type-level smoke checks should be authored as Vitest tests.
- Spec 37 D2 is the source of truth for the exact `RenderModel` shape and sub-types.

## Files to Touch

- `packages/runner/src/model/render-model.ts` — **new file**: all `RenderModel` and sub-type interfaces
- `packages/runner/test/model/render-model-types.test.ts` — **new file**: type-level construction tests

## Out of Scope

- `deriveRenderModel()` implementation (STATEMOD-004 through STATEMOD-007)
- `formatIdAsDisplayName()` utility (Spec 37 D9)
- Store implementation (`createGameStore`, STATEMOD-008)
- Any engine changes
- PixiJS / React integration

## What to Do

### 1. Create `render-model.ts`

Define all interfaces from Spec 37 D2:

**Top-level**: `RenderModel`

**Sub-types** (all in the same file):
- `RenderZone` — zone with token IDs, markers, visibility, selectability
- `RenderAdjacency` — from/to zone ID pair
- `RenderMapSpace` — spatial metadata for map-based games
- `RenderToken` — visible token with properties, selectability
- `RenderVariable` — name/value/displayName for variables
- `RenderMarker` — space marker with possible states
- `RenderGlobalMarker` — global marker with possible states
- `RenderTrack` — numeric track (global or per-faction)
- `RenderLastingEffect` — active lasting effect info
- `RenderInterruptFrame` — interrupt stack entry
- `RenderEventDeck` — event deck state (sizes, current card)
- `RenderPlayer` — player info (human/AI, active, eliminated)
- `RenderActionGroup` — grouped actions for toolbar
- `RenderAction` — individual action (available or not)
- `RenderChoiceStep` — breadcrumb entry for progressive choice
- `RenderChoiceOption` — single choice option with legality
- `RenderChoiceDomain` — numeric range for domain choices
- `RenderWarning` — move enumeration warning
- `RenderTerminal` — discriminated union for terminal results
- `RenderPlayerScore` — player/score pair for score-type terminal
- `RenderVictoryMetadata` — COIN-style victory metadata
- `RenderVictoryRankingEntry` — faction ranking entry

All fields must be `readonly`. All arrays must be `readonly T[]`. All map fields must use `ReadonlyMap`.

### 2. Type-level smoke tests

Verify that all interfaces can be constructed with valid values, that `PlayerId` (branded number) is used correctly, and that `MoveParamValue` passes through as expected.

## Acceptance Criteria

### Tests that must pass

- [x] `packages/runner/test/model/render-model-types.test.ts`: `RenderModel` can be constructed with all required fields
- [x] `packages/runner/test/model/render-model-types.test.ts`: `RenderZone.ownerID` accepts `PlayerId | null`
- [x] `packages/runner/test/model/render-model-types.test.ts`: `RenderToken.ownerID` accepts `PlayerId | null`
- [x] `packages/runner/test/model/render-model-types.test.ts`: `RenderTerminal` discriminated union covers all 4 variants (`win`, `lossAll`, `draw`, `score`)
- [x] `packages/runner/test/model/render-model-types.test.ts`: `RenderChoiceOption.value` accepts `MoveParamValue` (scalar or array)
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes

### Invariants

- All player ID fields use `PlayerId` (branded number), never `string`
- All interfaces are game-agnostic — no game-specific fields (no FITL terms, no poker terms)
- All fields are `readonly`
- `RenderModel.activePlayerID` is `PlayerId`, not `string | number`
- `RenderVariable.value` is `number | boolean` only — matches engine's `VariableValue`
- `RenderTerminal` is a discriminated union on `type` field
- No runtime code in `render-model.ts` — type declarations only
- No engine source files modified

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/model/render-model.ts` with the full Spec 37 D2 `RenderModel` and sub-type contracts.
  - Added `packages/runner/test/model/render-model-types.test.ts` with Vitest-based type-level smoke tests for model construction, player ID typing, terminal union coverage, and `MoveParamValue` pass-through.
  - Updated ticket assumptions to match current repository state before implementation.
- **Deviations from original plan**:
  - Dependencies were corrected from legacy backlog references (`STATEMOD-001/002`) to `None` for the active queue.
  - Validation was expanded beyond ticket minimum to include `pnpm -F @ludoforge/runner lint`, `pnpm turbo test`, and `pnpm turbo lint`.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
