# STATEMOD-007: Implement `deriveRenderModel()` — Players, Phases, Turn Order, Actions, Choices, Terminal, Warnings

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D3 items 9-13, 15; D7, D8, D10)
**Deps**: STATEMOD-004, STATEMOD-006

## Objective

Complete the still-placeholder `deriveRenderModel()` surfaces: players, turn-order list, action grouping, choice extraction + selectability, terminal mapping, and move enumeration warnings.

## Assumption Reassessment (2026-02-17)

- `deriveRenderModel()` is already partially implemented beyond STATEMOD-004/006 scope:
  - Zones/tokens + visibility/reveal filtering are implemented and covered in `derive-render-model-zones.test.ts`.
  - Variables, markers, tracks, lasting effects, interrupt stack, and event decks are implemented and covered in `derive-render-model-state.test.ts`.
  - `phaseName`, `phaseDisplayName`, `activePlayerID`, `turnOrderType`, and simultaneous submitted derivation are already implemented.
- The remaining gap is currently explicit placeholders in `derive-render-model.ts`:
  - `players`, `turnOrder`, `actionGroups`, `choiceBreadcrumb`, `currentChoiceOptions`, `choiceType`, `choiceMin`, `choiceMax`, `moveEnumerationWarnings`, `terminal`.
  - `isSelectable` on zones/tokens is currently always `false`.
- The original ticket assumed a new `derive-render-model-ui.test.ts`; current repo structure already uses split tests (`derive-render-model-state.test.ts`, `derive-render-model-zones.test.ts`). Scope is updated to extend existing files (or add a focused derive-render-model test file only if clarity requires it).
- Architecture note: This work should preserve the current static-vs-dynamic derivation split (`deriveStaticRenderDerivation()` + per-state derivation). That split is cleaner and more extensible than a monolithic derivation pass.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — implement remaining placeholder derivations and selectability propagation
- `packages/runner/test/model/derive-render-model-state.test.ts` — add/extend tests for players, turn order, actions, choices, terminal, warnings
- `packages/runner/test/model/derive-render-model-zones.test.ts` — add/extend tests for zone/token selectability when choice options reference IDs

## Out of Scope

- Zone/token base derivation (STATEMOD-004)
- Hidden information filtering (STATEMOD-005)
- Variables, markers, tracks, effects, interrupts, event decks (STATEMOD-006)
- Store integration (STATEMOD-008)
- Animation processing (Spec 40)
- Visual config overrides (Spec 42)
- Any engine changes

## What to Do

### 1. Players derivation

- Create `RenderPlayer[]` from `def.metadata.players` range (0 to playerCount-1).
- `id`: `asPlayerId(i)`.
- `displayName`: Look up faction name from turn order state if card-driven, else `formatIdAsDisplayName(String(i))`.
- `isHuman`: `context.playerSeats.get(id) === 'human'`.
- `isActive`: `id === state.activePlayer`.
- `isEliminated`: Determine from per-player vars (game-agnostic: check for `eliminated` var if present, else `false`).
- `factionId`: Derive from turn order faction assignment if available, else `null`.

### 2. Phase and turn order

- `phaseName`: `String(state.currentPhase)`.
- `phaseDisplayName`: `formatIdAsDisplayName(String(state.currentPhase))`.
- `activePlayerID`: `state.activePlayer`.
- `turnOrder`: Derive player order from `state.turnOrderState`. For `roundRobin`/`simultaneous`, list all players in numeric order. For `fixedOrder`, rotate numeric order so `currentIndex` is first. For `cardDriven`, list players by `runtime.factionOrder` mapped to player IDs and append any remaining players in numeric order.
- `turnOrderType`: `state.turnOrderState.type`.
- `simultaneousSubmitted`: For `simultaneous` type, extract player IDs with `submitted === true`. Empty for other types.

### 3. Action grouping (D7)

Implement the algorithm from the spec:
1. Iterate over `context.legalMoveResult.moves`.
2. Group by `move.actionClass` (or `"Actions"` fallback).
3. Deduplicate actions by `actionId` within each group.
4. `RenderAction.isAvailable = true` if at least one legal move exists for that action.
5. `RenderAction.displayName = formatIdAsDisplayName(actionId)`.
6. `RenderActionGroup.groupName = formatIdAsDisplayName(actionClass)` or `"Actions"`.

### 4. Choice extraction

When `context.choicePending` is non-null:
- `choiceType`: `context.choicePending.type` (`'chooseOne'` or `'chooseN'`).
- `choiceMin`: `context.choicePending.min ?? null`.
- `choiceMax`: `context.choicePending.max ?? null`.
- `currentChoiceOptions`: Map `context.choicePending.options` to `RenderChoiceOption[]`. Each option has `value` (the `MoveParamValue`), `displayName` (`formatIdAsDisplayName(String(value))`), `isLegal = true`, `illegalReason = null` (illegal options are not currently surfaced by the engine at this level).
- `currentChoiceDomain`: `null` (domain-based choices are a future extension).
- `choiceBreadcrumb`: Map `context.choiceStack` to `RenderChoiceStep[]` with display names.

### 5. Selectability and highlighting

Based on `context.choicePending`:
- If `choicePending` has options that reference zone IDs (as `MoveParamValue`), set those zones' `isSelectable = true`.
- If `choicePending` has options that reference token IDs, set those tokens' `isSelectable = true`.
- For scalar/array `MoveParamValue`, match any string element against zone IDs and token IDs.
- `isHighlighted`: Zones adjacent to a selected zone (if the choice context is spatial). For now, keep `false` — full adjacency highlighting is a Spec 38/40 concern.

### 6. Terminal mapping (D8)

Map `context.terminal` to `RenderTerminal | null` per the spec table:
- `'win'` → `{ type: 'win', player, message: "Player N wins!", victory?: RenderVictoryMetadata }`
- `'lossAll'` → `{ type: 'lossAll', message: "All players lose." }`
- `'draw'` → `{ type: 'draw', message: "The game is a draw." }`
- `'score'` → `{ type: 'score', ranking: RenderPlayerScore[], message: "Game over — final rankings." }`

For `RenderVictoryMetadata`: map from `VictoryTerminalMetadata` fields.

### 7. Move enumeration warnings

Map `context.legalMoveResult?.warnings` to `RenderWarning[]`.

## Acceptance Criteria

### Tests that must pass

- [x] Players: correct count, `isHuman` from playerSeats, `isActive` matches `state.activePlayer`
- [x] Phase: `phaseName` and `phaseDisplayName` derived from `state.currentPhase`
- [x] Turn order type: `turnOrderType` matches `state.turnOrderState.type`
- [x] Turn order list is derived per `turnOrderState.type`
- [x] Action grouping: moves with same `actionClass` group together
- [x] Action grouping: moves without `actionClass` go to `"Actions"` fallback group
- [x] Action grouping: duplicate `actionId` within a group deduplicated
- [x] Action grouping: `isAvailable = true` when at least one legal move exists
- [x] Action grouping: no legal moves → empty `actionGroups`
- [x] Choice extraction: `choicePending` maps to `currentChoiceOptions` with correct display names
- [x] Choice extraction: `chooseN` type exposes `choiceMin` and `choiceMax`
- [x] Choice breadcrumb: `choiceStack` maps to `RenderChoiceStep[]` with display names
- [x] Selectability: zone IDs in choice options make corresponding zones `isSelectable = true`
- [x] Selectability: token IDs in choice options make corresponding tokens `isSelectable = true`
- [x] Terminal win: maps to `RenderTerminal` with `type: 'win'`, correct player, message
- [x] Terminal lossAll: maps to `{ type: 'lossAll', message }`
- [x] Terminal draw: maps to `{ type: 'draw', message }`
- [x] Terminal score: ranking maps to `RenderPlayerScore[]`
- [x] Terminal null: no terminal → `renderModel.terminal = null`
- [x] Warnings: `legalMoveResult.warnings` mapped to `RenderWarning[]`
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes
- [x] `pnpm -F @ludoforge/runner lint` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- Action grouping follows the exact algorithm from D7 — no other grouping logic
- `RenderTerminal` type discriminant exactly matches spec (`'win' | 'lossAll' | 'draw' | 'score'`)
- All display names via `formatIdAsDisplayName()` — no hardcoded strings except terminal messages
- `PlayerId` branded number throughout, never string
- No game-specific logic
- No engine source files modified

## Outcome

- Completion date: 2026-02-17
- What changed:
  - Implemented remaining `deriveRenderModel()` placeholders for players, turn-order list, action groups, choice breadcrumb/options/type/min/max, terminal mapping, and warning mapping.
  - Added typed choice-driven selectability for zones and tokens by resolving the pending decision against the selected action's `ParamDef.domain` in `GameDef` (zone-producing queries -> zone selectability, token-producing queries -> token selectability), with support for composed decision IDs (`decision:...::bind`).
  - Preserved existing architecture split between static render derivation and per-state dynamic derivation.
  - Extended existing runner model tests instead of introducing a new derive-render-model UI test file.
- Deviations from original plan:
  - The original plan proposed a new `packages/runner/test/model/derive-render-model-ui.test.ts`; implementation used existing split suites:
    - `packages/runner/test/model/derive-render-model-state.test.ts`
    - `packages/runner/test/model/derive-render-model-zones.test.ts`
- Verification:
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
