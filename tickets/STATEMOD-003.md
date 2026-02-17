# STATEMOD-003: Define RenderModel Type Definitions

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D2)
**Deps**: STATEMOD-001

## Objective

Define all `Render*` TypeScript interfaces that make up the `RenderModel` — the flat, denormalized, game-agnostic view of game state consumed by both the PixiJS canvas and React DOM UI.

## Files to Touch

- `packages/runner/src/model/render-model.ts` — **new file**: all `RenderModel` and sub-type interfaces
- `packages/runner/test/model/render-model-types.test.ts` — **new file**: type-level construction tests

## Out of Scope

- `deriveRenderModel()` implementation (STATEMOD-004 through STATEMOD-007)
- `formatIdAsDisplayName()` utility (STATEMOD-002)
- Store types and store implementation (STATEMOD-001, STATEMOD-008)
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

All fields must be `readonly`. All arrays must be `readonly T[]`. All maps must be `ReadonlyMap`.

### 2. Type-level smoke tests

Verify that all interfaces can be constructed with valid values, that `PlayerId` (branded number) is used correctly, and that `MoveParamValue` passes through as expected.

## Acceptance Criteria

### Tests that must pass

- [ ] `packages/runner/test/model/render-model-types.test.ts`: `RenderModel` can be constructed with all required fields
- [ ] `packages/runner/test/model/render-model-types.test.ts`: `RenderZone.ownerID` accepts `PlayerId | null`
- [ ] `packages/runner/test/model/render-model-types.test.ts`: `RenderToken.ownerID` accepts `PlayerId | null`
- [ ] `packages/runner/test/model/render-model-types.test.ts`: `RenderTerminal` discriminated union covers all 4 variants (`win`, `lossAll`, `draw`, `score`)
- [ ] `packages/runner/test/model/render-model-types.test.ts`: `RenderChoiceOption.value` accepts `MoveParamValue` (scalar or array)
- [ ] `pnpm -F @ludoforge/runner typecheck` passes

### Invariants

- All player ID fields use `PlayerId` (branded number), never `string`
- All interfaces are game-agnostic — no game-specific fields (no FITL terms, no poker terms)
- All fields are `readonly`
- `RenderModel.activePlayerID` is `PlayerId`, not `string | number`
- `RenderVariable.value` is `number | boolean` only — matches engine's `VariableValue`
- `RenderTerminal` is a discriminated union on `type` field
- No runtime code in `render-model.ts` — types/interfaces only (all exports should be `interface` or `type`)
- No engine source files modified
